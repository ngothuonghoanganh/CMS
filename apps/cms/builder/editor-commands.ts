import type { Component, ComponentDefinition, Editor } from 'grapesjs';
import {
  PAGE_COMPONENT_REGISTRY,
  PAGE_STYLE_PROPERTY_BY_EDITOR_KEY,
  canDuplicateInSlot,
  canRemoveFromSlot,
  resolveSlotForChild,
  isOpenCompositionNodeType,
  type SiteDesignSystem,
  type OpenCompositionNodeType,
  type StyleTokenReference,
  canonicalizeOpenCompositionOptions,
} from '@payload/contracts';

import {
  canMoveNode,
  findPayloadComponent,
  moveNodeByIntent,
  payloadNodeType,
  type MoveNodeIntent,
} from './builder-interaction';
import {
  BUILDER_NODE_TYPE_ATTRIBUTE,
  BUILDER_NODE_ID_ATTRIBUTE,
  BUILDER_NODE_SLOT_ATTRIBUTE,
  BUILDER_OPEN_COMPOSITION_ATTRIBUTE,
  BUILDER_OPEN_PROPS_ATTRIBUTE,
  BUILDER_OPEN_BEHAVIORS_ATTRIBUTE,
  createBlockDefinition,
  createOpenCompositionNodeDefinition,
  quotePreviewComponents,
  openCompositionControlPreviewComponents,
  openCompositionIconPreviewComponents,
  isBuilderNodeType,
  payloadToEditorComponent,
  sanitizeInlineText,
  serializeGrapesComponent,
  snapshotFromGrapesComponent,
  updateEditorViewportStyle,
  updateEditorPartViewportStyle,
  type BuilderViewport,
  type BuilderBlockType,
  type BuilderNodeType,
} from './builder-block/builder-adapter';
import {
  applyEditorPropertyUpdate,
  getComponentEditorCodec,
} from './builder-block/component-editor-codecs';
import {
  canInsertLiveChild,
  liveSlotForChild,
  liveSlotOccupancy,
} from './builder-block/builder-structural-domain';
import {
  assertUniquePersistedNodeIds,
  collectPersistedNodeIds,
  generateFreshNodeId,
  remapSubtreeNodeIds,
} from './builder-node-identity';

/**
 * The builder deliberately keeps GrapesJS as the Model-A document engine.
 * This command boundary is the single mutation vocabulary used by the CMS
 * surfaces; it prevents Canvas, Layers and Inspector from inventing separate
 * mutation semantics while leaving the persisted PagePayload unchanged.
 */
export type EditorCommand =
  | {
      kind: 'insert';
      definition: ComponentDefinition;
      parentId?: string | undefined;
      targetId?: string | undefined;
      position?: 'before' | 'after' | undefined;
    }
  | { kind: 'move'; intent: MoveNodeIntent }
  | { kind: 'remove'; nodeId: string }
  | { kind: 'duplicate'; nodeId: string }
  | {
      kind: 'detach-reusable';
      nodeId: string;
      definition: ComponentDefinition;
    }
  | {
      kind: 'apply-global-preset';
      nodeId: string;
      definition: ComponentDefinition;
    }
  | {
      kind: 'update-props';
      nodeId: string;
      content?: string | undefined;
      attributes?: Record<string, string> | undefined;
      components?: ComponentDefinition[] | undefined;
    }
  | { kind: 'set-content'; nodeId: string; content: string }
  | { kind: 'set-property'; nodeId: string; property: string; value: unknown }
  | { kind: 'set-attributes'; attributes: Record<string, string>; nodeId: string }
  | { kind: 'set-style'; nodeId: string; style: Record<string, string> }
  | {
      kind: 'set-responsive-style';
      nodeId: string;
      property: string;
      value: string | StyleTokenReference;
      viewport: BuilderViewport;
    }
  | {
      kind: 'set-part-responsive-style';
      nodeId: string;
      partName: string;
      property: string;
      value: string | StyleTokenReference;
      viewport: BuilderViewport;
    }
  | {
      kind: 'insert-child';
      parentId: string;
      slotName: string;
      childType: BuilderBlockType | OpenCompositionNodeType;
      index?: number;
    }
  /** @deprecated Kept as a compatibility shim for older callers. */
  | {
      kind: 'insert-structural-child';
      parentId: string;
      childType: BuilderBlockType | OpenCompositionNodeType;
      slotName?: string;
    }
  | { kind: 'undo' }
  | { kind: 'redo' };

export type EditorCommandResult = {
  changed: boolean;
  selection?: Component;
};

export type BuilderCommandBus = {
  dispatch: (command: EditorCommand) => EditorCommandResult;
  canDispatch: (command: EditorCommand) => boolean;
};

let duplicateHistorySequence = 0;

const OPEN_BEHAVIOR_REFERENCE_KEYS = [
  'nodeId',
  'formNodeId',
  'labelNodeId',
  'controlNodeId',
  'targetNodeId',
] as const;

type OpenBehaviorEntry = {
  owner: Component;
  behavior: Record<string, unknown>;
};

type HistoryEntry = { set?: (key: string, value: unknown) => void };

function getHistoryEntries(editor: Editor): HistoryEntry[] {
  const getStack = (editor.UndoManager as unknown as { getStack?: () => unknown })
    .getStack;
  if (typeof getStack !== 'function') return [];
  const stack = getStack.call(editor.UndoManager) as
    { models?: HistoryEntry[] } | HistoryEntry[];
  return Array.isArray(stack) ? stack : (stack.models ?? []);
}

function groupNewHistoryActions(
  editor: Editor,
  previousEntries: Set<HistoryEntry>,
): void {
  const entries = getHistoryEntries(editor).filter(
    (entry) => !previousEntries.has(entry),
  );
  if (entries.length === 0) return;
  const marker = `builder-duplicate-${++duplicateHistorySequence}`;
  entries.forEach((entry) => {
    entry.set?.('magicFusionIndex', marker);
  });
}

function getRoot(editor: Editor): Component | undefined {
  return editor.getComponents().models[0];
}

function getNode(editor: Editor, nodeId: string): Component | undefined {
  const root = getRoot(editor);
  return root ? findPayloadComponent(root, nodeId) : undefined;
}

function definitionNodeType(
  definition: ComponentDefinition,
): BuilderNodeType | undefined {
  const type = definition.attributes?.[BUILDER_NODE_TYPE_ATTRIBUTE];
  return typeof type === 'string' && isBuilderNodeType(type) ? type : undefined;
}

function definitionOpenNodeType(
  definition: ComponentDefinition,
): OpenCompositionNodeType | undefined {
  const attributes = definition.attributes ?? {};
  const type = attributes[BUILDER_NODE_TYPE_ATTRIBUTE];
  return attributes[BUILDER_OPEN_COMPOSITION_ATTRIBUTE] === 'true' &&
    typeof type === 'string' &&
    isOpenCompositionNodeType(type)
    ? type
    : undefined;
}

function openNodeType(component: Component): OpenCompositionNodeType | undefined {
  const attributes = component.getAttributes({ noStyle: true });
  const type = attributes[BUILDER_NODE_TYPE_ATTRIBUTE];
  return attributes[BUILDER_OPEN_COMPOSITION_ATTRIBUTE] === 'true' &&
    typeof type === 'string' &&
    isOpenCompositionNodeType(type)
    ? type
    : undefined;
}

function openProps(component: Component): Record<string, unknown> | undefined {
  const raw = component.getAttributes({ noStyle: true })[BUILDER_OPEN_PROPS_ATTRIBUTE];
  if (typeof raw !== 'string') return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizedOpenValue(value: unknown, depth = 0): unknown {
  if (depth > 8) throw new Error('Open Composition property nesting is too deep');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return typeof value === 'string' ? sanitizeInlineText(value) : value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new Error('Open Composition numbers must be finite');
    return value;
  }
  if (Array.isArray(value))
    return value.map((item) => normalizedOpenValue(item, depth + 1));
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,119}$/.test(key)) {
        throw new Error('Open Composition property keys are invalid');
      }
      result[key] = normalizedOpenValue(item, depth + 1);
    }
    return result;
  }
  throw new Error('Open Composition properties must be JSON values');
}

const OPEN_INPUT_TYPES = new Set([
  'text',
  'email',
  'phone',
  'textarea',
  'select',
  'checkbox',
  'radio',
]);

function setOpenProps(component: Component, props: Record<string, unknown>): void {
  component.setAttributes({
    ...component.getAttributes({ noStyle: true }),
    [BUILDER_OPEN_PROPS_ATTRIBUTE]: JSON.stringify(props),
  });
}

function syncComposedTextChild(component: Component, label: string): void {
  const textChild = component
    .components()
    .models.find((child) => openNodeType(child) === 'text');
  if (!textChild) {
    component.set('content', label);
    return;
  }
  const childProps = openProps(textChild);
  if (childProps) setOpenProps(textChild, { ...childProps, text: label });
  textChild.set('content', label);
}

function syncComposedParentLabel(component: Component, label: string): void {
  const parent = component.parent();
  const parentType = parent && openNodeType(parent);
  if (!parent || (parentType !== 'button' && parentType !== 'link')) return;
  const parentProps = openProps(parent);
  if (parentProps) setOpenProps(parent, { ...parentProps, label });
  parent.set('content', label);
}

function updateOpenFieldBehavior(
  component: Component,
  property: string,
  value: unknown,
): void {
  const componentId = component.getAttributes({ noStyle: true })[
    BUILDER_NODE_ID_ATTRIBUTE
  ];
  if (typeof componentId !== 'string') return;
  let owner: Component | undefined = component;
  while (owner) {
    const raw = owner.getAttributes({ noStyle: true })[BUILDER_OPEN_BEHAVIORS_ATTRIBUTE];
    if (typeof raw === 'string') {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw) as unknown;
      } catch {
        parsed = undefined;
      }
      if (Array.isArray(parsed)) {
        const next = parsed.map((candidate) => {
          if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
            return candidate;
          }
          const behavior = candidate as Record<string, unknown>;
          if (
            behavior.kind !== 'field' ||
            (behavior.nodeId !== componentId && behavior.controlNodeId !== componentId)
          ) {
            return candidate;
          }
          if (property === 'required' && typeof value === 'boolean') {
            return { ...behavior, required: value };
          }
          const inputType = value === 'tel' ? 'phone' : value;
          return property === 'type' &&
            typeof inputType === 'string' &&
            OPEN_INPUT_TYPES.has(inputType)
            ? { ...behavior, inputType }
            : candidate;
        });
        if (JSON.stringify(next) !== JSON.stringify(parsed)) {
          owner.setAttributes({
            ...owner.getAttributes({ noStyle: true }),
            [BUILDER_OPEN_BEHAVIORS_ATTRIBUTE]: JSON.stringify(next),
          });
        }
      }
    }
    owner = owner.parent();
  }
}

function directOpenFieldChild(
  field: Component,
  types: readonly OpenCompositionNodeType[],
): Component | undefined {
  return field.components().models.find((child) => {
    const type = openNodeType(child);
    return type !== undefined && types.includes(type);
  });
}

function refreshOpenControlPreview(component: Component): void {
  const type = openNodeType(component);
  if (type !== 'input' && type !== 'textarea' && type !== 'select') return;
  const props = openProps(component);
  if (!props) return;
  component.components(openCompositionControlPreviewComponents({ type, props }));
}

function updateOpenControlType(component: Component, value: string): string {
  const inputType = value === 'tel' ? 'phone' : value;
  if (!OPEN_INPUT_TYPES.has(inputType)) return value;
  const nodeType: OpenCompositionNodeType =
    inputType === 'textarea' ? 'textarea' : inputType === 'select' ? 'select' : 'input';
  component.setAttributes({
    ...component.getAttributes({ noStyle: true }),
    [BUILDER_NODE_TYPE_ATTRIBUTE]: nodeType,
  });
  component.set('tagName', nodeType);
  component.set('void', nodeType === 'input');
  return inputType;
}

function updateOpenFormFieldProperty(
  component: Component,
  property: string,
  value: unknown,
): boolean {
  const fieldProps = openProps(component);
  if (!fieldProps) return false;

  if (property === 'label') {
    if (typeof value !== 'string' || !value.trim()) return false;
    const label = directOpenFieldChild(component, ['label']);
    const labelProps = label && openProps(label);
    if (!label || !labelProps) return false;
    setOpenProps(label, { ...labelProps, text: value });
    label.set('content', value);
    return true;
  }

  if (property === 'required') {
    if (typeof value !== 'boolean') return false;
    setOpenProps(component, { ...fieldProps, required: value });
    updateOpenFieldBehavior(component, property, value);
    return true;
  }

  const control = directOpenFieldChild(component, ['input', 'textarea', 'select']);
  if (!control) return false;
  if (property === 'type' || property === 'placeholder') {
    return updateOpenProperty(control, property, value);
  }
  if (property === 'options') {
    const controlProps = openProps(control);
    const inputType = controlProps?.type;
    if (inputType !== 'select' && inputType !== 'radio') return false;
    return updateOpenProperty(control, property, value);
  }
  return false;
}

function updateOpenProperty(
  component: Component,
  property: string,
  value: unknown,
): boolean {
  const type = openNodeType(component);
  const current = openProps(component);
  if (!type || !current || !/^[A-Za-z][A-Za-z0-9_-]{0,119}$/.test(property)) return false;
  let nextValue: unknown;
  try {
    nextValue = normalizedOpenValue(value);
  } catch {
    return false;
  }
  if (
    type === 'form-field' &&
    ['label', 'type', 'required', 'placeholder', 'options'].includes(property)
  ) {
    return updateOpenFormFieldProperty(component, property, nextValue);
  }
  const canonicalValue =
    property === 'options'
      ? canonicalizeOpenCompositionOptions(nextValue)
      : property === 'type' && typeof nextValue === 'string'
        ? updateOpenControlType(component, nextValue)
        : nextValue;
  const next = { ...current, [property]: canonicalValue };
  if (property === 'type') {
    if (['select', 'radio'].includes(String(canonicalValue))) {
      next.options = canonicalizeOpenCompositionOptions(next.options);
    } else {
      delete next.options;
    }
  } else if (property === 'options' && !['select', 'radio'].includes(String(next.type))) {
    delete next.options;
  }
  const serialized = JSON.stringify(next);
  if (serialized.length > 64 * 1024) return false;
  const attributes = component.getAttributes({ noStyle: true });
  const mirroredStringAttribute =
    ['src', 'alt', 'href', 'target', 'name', 'type', 'placeholder', 'poster'].includes(
      property,
    ) && typeof canonicalValue === 'string'
      ? property
      : undefined;
  const mirroredBooleanAttribute =
    ['required', 'disabled', 'checked', 'controls'].includes(property) &&
    typeof canonicalValue === 'boolean'
      ? property
      : undefined;
  component.setAttributes({
    ...attributes,
    [BUILDER_OPEN_PROPS_ATTRIBUTE]: serialized,
    ...(mirroredStringAttribute ? { [mirroredStringAttribute]: canonicalValue } : {}),
    ...(mirroredBooleanAttribute && canonicalValue === true
      ? { [mirroredBooleanAttribute]: 'true' }
      : {}),
  });
  if (mirroredBooleanAttribute && canonicalValue === false) {
    component.removeAttributes?.(mirroredBooleanAttribute);
  }
  if (property === 'poster' && canonicalValue === '') {
    component.removeAttributes?.('poster');
  }
  if (['text', 'heading', 'label'].includes(type) && property === 'text') {
    component.set('content', String(canonicalValue));
    syncComposedParentLabel(component, String(canonicalValue));
  }
  if ((type === 'button' || type === 'link') && property === 'label') {
    // The child owns visual text. The parent label is a derived compatibility
    // projection retained for existing Inspector consumers.
    syncComposedTextChild(component, String(canonicalValue));
  }
  if (type === 'icon' && property === 'name') {
    component.components(openCompositionIconPreviewComponents(canonicalValue));
  }
  if (
    (type === 'input' || type === 'textarea' || type === 'select') &&
    (property === 'type' || property === 'options')
  ) {
    refreshOpenControlPreview(component);
  }
  if (type === 'quote' && (property === 'text' || property === 'cite')) {
    component.components(
      quotePreviewComponents({
        text: typeof next.text === 'string' ? next.text : '',
        ...(typeof next.cite === 'string' ? { cite: next.cite } : {}),
      }),
    );
  }
  if (type === 'form-field' && property === 'required') {
    updateOpenFieldBehavior(component, property, canonicalValue);
  } else if (
    (type === 'input' || type === 'textarea' || type === 'select') &&
    property === 'type'
  ) {
    updateOpenFieldBehavior(component, property, canonicalValue);
  }
  return true;
}

function updateOpenPropertyPreview(
  component: Component,
  property: string,
  value: unknown,
): boolean {
  if (!openNodeType(component) || !openProps(component)) return false;
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,119}$/.test(property)) return false;
  try {
    const serialized = JSON.stringify({
      ...openProps(component),
      [property]: normalizedOpenValue(value),
    });
    return typeof serialized === 'string' && serialized.length <= 64 * 1024;
  } catch {
    return false;
  }
}

function canRemoveLiveNode(root: Component, node: Component): boolean {
  if (node === root) return false;
  const parent = node.parent();
  const openParentType = parent && openNodeType(parent);
  const openChildType = openNodeType(node);
  if (
    openParentType === 'form-field' &&
    (openChildType === 'label' ||
      openChildType === 'input' ||
      openChildType === 'textarea' ||
      openChildType === 'select')
  ) {
    return false;
  }
  const parentType = parent && payloadNodeType(parent);
  const nodeType = payloadNodeType(node);
  if (!parent || !parentType || !nodeType) return true;
  const slot = liveSlotForChild(parent, nodeType);
  return (
    !slot ||
    canRemoveFromSlot({
      parentType,
      slotName: slot.name,
      childType: nodeType,
      occupancy: liveSlotOccupancy(parent, slot),
    })
  );
}

function canDuplicateLiveNode(root: Component, node: Component): boolean {
  if (node === root) return false;
  const parent = node.parent();
  const parentType = parent && payloadNodeType(parent);
  const nodeType = payloadNodeType(node);
  if (!parent || !parentType || !nodeType) return true;
  const slot = liveSlotForChild(parent, nodeType);
  return (
    !slot ||
    canDuplicateInSlot({
      parentType,
      slotName: slot.name,
      childType: nodeType,
      occupancy: liveSlotOccupancy(parent, slot),
    })
  );
}

function canInsertDefinition(
  parent: Component,
  definition: ComponentDefinition,
  slotName?: string,
): boolean {
  const childType = definitionNodeType(definition) ?? definitionOpenNodeType(definition);
  // `droppable` is presentation behavior; command validation remains domain
  // driven and therefore also applies to Quick Add, Layers and keyboard paths.
  return Boolean(childType && canInsertLiveChild(parent, childType, undefined, slotName));
}

function isOpenCompositionRoot(root: Component): boolean {
  return (
    root.getAttributes({ noStyle: true })[BUILDER_OPEN_COMPOSITION_ATTRIBUTE] === 'true'
  );
}

/**
 * Keep legacy pages lazy until an Open Composition recipe is actually used.
 * This preserves the closed-widget editor contract for existing blocks while
 * giving the new recipe a valid V8 document to append to.
 */
function promoteLegacyRootForOpenInsert(root: Component): boolean {
  if (isOpenCompositionRoot(root)) return true;
  try {
    const legacyPayload = serializeGrapesComponent(root, 'page');
    if ('documentKind' in legacyPayload || legacyPayload.version === 8) return true;
    const definition = payloadToEditorComponent(legacyPayload, {
      openCompositionMode: true,
    });
    root.setAttributes(definition.attributes ?? {});
    const components = Array.isArray(definition.components)
      ? definition.components
      : definition.components
        ? [definition.components]
        : [];
    root.components(components);
    return isOpenCompositionRoot(root);
  } catch {
    return false;
  }
}

function canInsertLiveType(
  parent: Component,
  childType: BuilderNodeType | OpenCompositionNodeType,
  slotName?: string,
): boolean {
  if (openNodeType(parent)) {
    return isOpenCompositionNodeType(childType)
      ? canInsertLiveChild(parent, childType, undefined, slotName)
      : false;
  }
  const parentType = payloadNodeType(parent);
  if (!parentType || !isBuilderNodeType(childType)) return false;
  const slot = slotName
    ? PAGE_COMPONENT_REGISTRY[parentType].slots.find(
        (candidate) => candidate.name === slotName,
      )
    : resolveSlotForChild(parentType, childType);
  return Boolean(
    slot?.structural && canInsertLiveChild(parent, childType, undefined, slot.name),
  );
}

function definitionWithFreshIds(
  root: Component,
  definition: ComponentDefinition,
): ComponentDefinition {
  const currentSnapshot = {
    attributes: root.getAttributes({ noStyle: true }),
    children: root.components().models.map((child) => componentIdentitySnapshot(child)),
  };
  assertUniquePersistedNodeIds(currentSnapshot);
  return remapSubtreeNodeIds(definition, collectPersistedNodeIds(currentSnapshot));
}

function componentIdentitySnapshot(component: Component): {
  attributes: Record<string, unknown>;
  children: ReturnType<typeof componentIdentitySnapshot>[];
} {
  return {
    attributes: component.getAttributes({ noStyle: true }),
    children: component
      .components()
      .models.map((child) => componentIdentitySnapshot(child)),
  };
}

function componentNodeId(component: Component): string | undefined {
  const value = component.getAttributes({ noStyle: true })[BUILDER_NODE_ID_ATTRIBUTE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function collectComponentNodeIds(component: Component): Set<string> {
  const ids = new Set<string>();
  component.onAll((current) => {
    const id = componentNodeId(current);
    if (id) ids.add(id);
  });
  return ids;
}

function isWithinComponent(ancestor: Component, candidate: Component): boolean {
  let current: Component | undefined = candidate;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent();
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsedOpenBehaviors(component: Component): unknown[] | undefined {
  const raw = component.getAttributes({ noStyle: true })[
    BUILDER_OPEN_BEHAVIORS_ATTRIBUTE
  ];
  if (typeof raw !== 'string') return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function collectOpenBehaviors(root: Component): OpenBehaviorEntry[] {
  const entries: OpenBehaviorEntry[] = [];
  root.onAll((owner) => {
    parsedOpenBehaviors(owner)?.forEach((candidate) => {
      if (isRecord(candidate)) entries.push({ owner, behavior: candidate });
    });
  });
  return entries;
}

function setOpenBehaviors(component: Component, behaviors: unknown[]): void {
  component.setAttributes({
    ...component.getAttributes({ noStyle: true }),
    [BUILDER_OPEN_BEHAVIORS_ATTRIBUTE]: JSON.stringify(behaviors),
  });
}

/** Removes or repairs behavior references after a live subtree is deleted. */
function pruneOpenBehaviorsAfterRemoval(
  root: Component,
  removedNodeIds: ReadonlySet<string>,
): void {
  root.onAll((owner) => {
    const behaviors = parsedOpenBehaviors(owner);
    if (!behaviors) return;
    let changed = false;
    const next = behaviors.flatMap((candidate) => {
      if (!isRecord(candidate)) return [candidate];

      const nodeId = candidate.nodeId;
      if (typeof nodeId === 'string' && removedNodeIds.has(nodeId)) {
        changed = true;
        return [];
      }

      if (
        candidate.kind === 'field' &&
        typeof candidate.formNodeId === 'string' &&
        removedNodeIds.has(candidate.formNodeId)
      ) {
        changed = true;
        return [];
      }

      const repaired = { ...candidate };
      for (const key of OPEN_BEHAVIOR_REFERENCE_KEYS) {
        if (key === 'nodeId' || key === 'formNodeId') continue;
        const value = repaired[key];
        if (typeof value === 'string' && removedNodeIds.has(value)) {
          if (
            key === 'targetNodeId' &&
            candidate.kind === 'action' &&
            (candidate.action === 'submit-form' || candidate.action === 'reset-form')
          ) {
            changed = true;
            return [];
          }
          delete repaired[key];
          changed = true;
        }
      }
      return [repaired];
    });
    if (changed) setOpenBehaviors(owner, next);
  });
}

function openFormAncestor(component: Component): Component | undefined {
  let current: Component | undefined = component;
  while (current) {
    if (openNodeType(current) === 'form') return current;
    current = current.parent();
  }
  return undefined;
}

function liveFieldKey(value: unknown, fallback: string): string {
  const source = typeof value === 'string' ? value : fallback;
  const normalized = source
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  if (!normalized) return 'field';
  return /^[A-Za-z]/.test(normalized) ? normalized : `field-${normalized}`.slice(0, 64);
}

/** Rebinds form-owned behavior projections after a valid live reparent. */
function repairOpenBehaviorsAfterMove(root: Component): void {
  if (!isOpenCompositionRoot(root)) return;
  const nodes = new Map<string, Component>();
  root.onAll((component) => {
    const id = componentNodeId(component);
    if (id) nodes.set(id, component);
  });
  const usedFieldKeysByForm = new Map<string, Set<string>>();
  const fieldOrder = new Map<string, number>();
  let nextFieldOrder = 0;
  root.onAll((component) => {
    const id = componentNodeId(component);
    if (id && openNodeType(component) === 'form-field') {
      fieldOrder.set(id, nextFieldOrder++);
    }
  });
  collectOpenBehaviors(root)
    .sort((left, right) => {
      const leftOrder =
        typeof left.behavior.nodeId === 'string'
          ? (fieldOrder.get(left.behavior.nodeId) ?? Number.MAX_SAFE_INTEGER)
          : Number.MAX_SAFE_INTEGER;
      const rightOrder =
        typeof right.behavior.nodeId === 'string'
          ? (fieldOrder.get(right.behavior.nodeId) ?? Number.MAX_SAFE_INTEGER)
          : Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    })
    .forEach(({ owner, behavior }) => {
      if (!isRecord(behavior)) return;
      const source =
        typeof behavior.nodeId === 'string' ? nodes.get(behavior.nodeId) : undefined;
      let next: Record<string, unknown> | undefined;
      let shouldDrop = false;
      if (behavior.kind === 'field') {
        const form =
          source && openNodeType(source) === 'form-field'
            ? openFormAncestor(source)
            : undefined;
        const formId = form && componentNodeId(form);
        if (!formId) {
          shouldDrop = true;
        } else {
          const usedKeys = usedFieldKeysByForm.get(formId) ?? new Set<string>();
          usedFieldKeysByForm.set(formId, usedKeys);
          const control =
            typeof behavior.controlNodeId === 'string'
              ? nodes.get(behavior.controlNodeId)
              : undefined;
          const controlProps = control ? openProps(control) : undefined;
          const baseKey = liveFieldKey(
            behavior.fieldKey ?? controlProps?.name,
            `field-${behavior.nodeId ?? 'value'}`,
          );
          let fieldKey = baseKey;
          let suffix = 2;
          while (usedKeys.has(fieldKey)) {
            fieldKey = `${baseKey}-${suffix}`.slice(0, 64);
            suffix += 1;
          }
          usedKeys.add(fieldKey);
          if (behavior.formNodeId !== formId || behavior.fieldKey !== fieldKey) {
            next = { ...behavior, formNodeId: formId, fieldKey };
          }
          const sourceProps = source ? openProps(source) : undefined;
          if (source && sourceProps && sourceProps.fieldKey !== fieldKey) {
            setOpenProps(source, { ...sourceProps, fieldKey });
          }
          if (control && controlProps) {
            if (controlProps.fieldKey !== fieldKey || controlProps.name !== fieldKey) {
              setOpenProps(control, { ...controlProps, fieldKey, name: fieldKey });
              control.setAttributes({
                ...control.getAttributes({ noStyle: true }),
                name: fieldKey,
              });
            }
          }
        }
      } else if (
        behavior.kind === 'action' &&
        (behavior.action === 'submit-form' || behavior.action === 'reset-form')
      ) {
        const form = source && openFormAncestor(source);
        const formId = form && componentNodeId(form);
        if (!formId) {
          shouldDrop = true;
        } else if (behavior.targetNodeId !== formId) {
          next = { ...behavior, targetNodeId: formId };
        }
      }
      if (!shouldDrop && next === undefined) return;
      const current = parsedOpenBehaviors(owner);
      if (!current) return;
      const updated = current.flatMap((candidate) => {
        if (!isRecord(candidate) || candidate.id !== behavior.id) return [candidate];
        if (shouldDrop) return [];
        return [next];
      });
      if (JSON.stringify(updated) !== JSON.stringify(current))
        setOpenBehaviors(owner, updated);
    });
}

function definitionChildren(definition: ComponentDefinition): ComponentDefinition[] {
  const components = definition.components as unknown;
  if (Array.isArray(components)) return components as ComponentDefinition[];
  return isRecord(components) ? [components as ComponentDefinition] : [];
}

function buildComponentDefinitionIdMap(
  source: Component,
  definition: ComponentDefinition,
  idMap: Map<string, string>,
): void {
  const sourceId = componentNodeId(source);
  const definitionId = definition.attributes?.[BUILDER_NODE_ID_ATTRIBUTE];
  if (sourceId && typeof definitionId === 'string') idMap.set(sourceId, definitionId);

  const children = definitionChildren(definition);
  source.components().models.forEach((child, index) => {
    const childDefinition = children[index];
    if (childDefinition) buildComponentDefinitionIdMap(child, childDefinition, idMap);
  });
}

function duplicateOpenBehaviors(
  root: Component,
  source: Component,
  safeDefinition: ComponentDefinition,
): void {
  const sourceNodeIds = collectComponentNodeIds(source);
  if (sourceNodeIds.size === 0) return;

  const idMap = new Map<string, string>();
  buildComponentDefinitionIdMap(source, safeDefinition, idMap);
  const entries = collectOpenBehaviors(root);
  const reservedBehaviorIds = new Set(
    entries.flatMap(({ behavior }) =>
      typeof behavior.id === 'string' ? [behavior.id] : [],
    ),
  );
  const cloned: Record<string, unknown>[] = [];

  entries.forEach(({ owner, behavior }) => {
    // Behaviors stored on the source subtree are already included in the
    // definition and remapped by remapSubtreeNodeIds. Only clone behaviors
    // owned by an ancestor/root outside that subtree.
    if (isWithinComponent(source, owner)) return;
    if (typeof behavior.nodeId !== 'string' || !sourceNodeIds.has(behavior.nodeId)) {
      return;
    }
    const next = { ...behavior };
    for (const key of OPEN_BEHAVIOR_REFERENCE_KEYS) {
      const value = next[key];
      if (typeof value === 'string') next[key] = idMap.get(value) ?? value;
    }
    const behaviorId = generateFreshNodeId('behavior', reservedBehaviorIds);
    reservedBehaviorIds.add(behaviorId);
    next.id = behaviorId;
    cloned.push(next);
  });

  if (cloned.length === 0) return;
  const existing = parsedOpenBehaviors(root);
  if (existing) {
    setOpenBehaviors(root, [...existing, ...cloned]);
  } else {
    // A valid Open Composition root normally has an explicit empty behavior
    // list. Keeping this fallback makes a duplicate self-healing if an older
    // editor snapshot omitted that empty list.
    setOpenBehaviors(root, cloned);
  }
}

function definitionFromComponent(component: Component): ComponentDefinition {
  const toDefinition = (
    snapshot: ReturnType<typeof snapshotFromGrapesComponent>,
  ): ComponentDefinition => {
    const nodeType = snapshot.attributes[BUILDER_NODE_TYPE_ATTRIBUTE];
    const definition: ComponentDefinition = {
      type: nodeType === 'text' || nodeType === 'image' ? nodeType : 'default',
      tagName: snapshot.tagName,
      attributes: snapshot.attributes,
      content: snapshot.content,
      style: snapshot.style,
    };
    if (snapshot.attributes['data-payload-node-type'] !== 'reusable-instance') {
      definition.components = snapshot.children.map((child) => toDefinition(child));
    }
    return definition;
  };
  return toDefinition(snapshotFromGrapesComponent(component));
}

function globalPresetTargetIsValid(
  root: Component,
  node: Component | undefined,
  definition: ComponentDefinition,
): boolean {
  if (!node || node.parent() !== root) return false;
  const nodeType = payloadNodeType(node);
  const definitionType = definitionNodeType(definition);
  if (nodeType !== 'global-header' && nodeType !== 'global-footer') return false;
  if (nodeType !== definitionType) return false;
  const globalRoots = root.components().models.filter((child) => {
    const type = payloadNodeType(child);
    return type === 'global-header' || type === 'global-footer';
  });
  return globalRoots.length === 1 && globalRoots[0] === node;
}

export function createEditorCommandBus(
  editor: Editor,
  options: { designSystem?: SiteDesignSystem } = {},
): BuilderCommandBus {
  const bus: BuilderCommandBus = {
    dispatch: (command) => {
      if (!bus.canDispatch(command)) return { changed: false };
      return executeEditorCommand(editor, command, options);
    },
    canDispatch: (command) => {
      const root = getRoot(editor);
      if (!root) return false;
      if (command.kind === 'move') return canMoveNode(root, command.intent);
      if (command.kind === 'undo') return editor.UndoManager.hasUndo();
      if (command.kind === 'redo') return editor.UndoManager.hasRedo();
      if (command.kind === 'insert') {
        const hasTarget = command.targetId !== undefined;
        const target = hasTarget ? getNode(editor, command.targetId ?? '') : undefined;
        if (hasTarget && !target) return false;
        const parent = command.parentId
          ? getNode(editor, command.parentId)
          : (target?.parent() ?? root);
        return Boolean(
          parent &&
          canInsertDefinition(parent, command.definition) &&
          (!target || target.parent() === parent),
        );
      }
      if (command.kind === 'insert-child' || command.kind === 'insert-structural-child') {
        const parent = getNode(editor, command.parentId);
        if (!parent) return false;
        if (openNodeType(parent)) {
          return (
            isOpenCompositionNodeType(command.childType) &&
            canInsertLiveChild(parent, command.childType, undefined, command.slotName)
          );
        }
        const parentType = payloadNodeType(parent);
        if (!parentType || !isBuilderNodeType(command.childType)) return false;
        const slotName =
          command.slotName ?? resolveSlotForChild(parentType, command.childType)?.name;
        const slot = slotName
          ? PAGE_COMPONENT_REGISTRY[parentType].slots.find(
              (candidate) => candidate.name === slotName,
            )
          : undefined;
        return Boolean(
          slot?.structural && canInsertLiveType(parent, command.childType, slotName),
        );
      }
      if (command.kind === 'apply-global-preset') {
        return globalPresetTargetIsValid(
          root,
          getNode(editor, command.nodeId),
          command.definition,
        );
      }
      if (command.kind === 'detach-reusable') {
        const node = getNode(editor, command.nodeId);
        return Boolean(
          node &&
          payloadNodeType(node) === 'reusable-instance' &&
          definitionNodeType(command.definition) &&
          node.parent() &&
          canInsertDefinition(node.parent() as Component, command.definition),
        );
      }
      if (command.kind === 'set-property') {
        const node = getNode(editor, command.nodeId);
        if (!node) return false;
        if (openNodeType(node)) {
          return updateOpenPropertyPreview(node, command.property, command.value);
        }
        const type = node.getAttributes({ noStyle: true })[BUILDER_NODE_TYPE_ATTRIBUTE];
        if (!isBuilderNodeType(type)) return false;
        try {
          return Boolean(
            getComponentEditorCodec(type).resolvePropertyMutation(
              type,
              command.property,
              command.value,
              node,
            ),
          );
        } catch {
          return false;
        }
      }
      if (command.kind === 'set-part-responsive-style') {
        const node = getNode(editor, command.nodeId);
        const type = node && payloadNodeType(node);
        const part =
          type && PAGE_COMPONENT_REGISTRY[type].componentParts[command.partName];
        const styleDefinition =
          PAGE_STYLE_PROPERTY_BY_EDITOR_KEY[
            command.property as keyof typeof PAGE_STYLE_PROPERTY_BY_EDITOR_KEY
          ];
        return Boolean(
          node &&
          type &&
          part &&
          styleDefinition &&
          part.styleCapabilities.includes(command.property as never),
        );
      }
      if ('nodeId' in command) {
        const node = getNode(editor, command.nodeId);
        if (!node) return false;
        if (command.kind === 'remove' && !canRemoveLiveNode(root, node)) return false;
        if (command.kind === 'duplicate' && !canDuplicateLiveNode(root, node))
          return false;
        return true;
      }
      return true;
    },
  };
  return bus;
}

export function executeEditorCommand(
  editor: Editor,
  command: EditorCommand,
  options: { designSystem?: SiteDesignSystem } = {},
): EditorCommandResult {
  const root = getRoot(editor);
  if (!root) return { changed: false };

  switch (command.kind) {
    case 'insert': {
      if (
        definitionOpenNodeType(command.definition) &&
        !isOpenCompositionRoot(root) &&
        !promoteLegacyRootForOpenInsert(root)
      ) {
        return { changed: false };
      }
      const hasTarget = command.targetId !== undefined;
      const requestedTarget = command.targetId
        ? getNode(editor, command.targetId)
        : undefined;
      if (hasTarget && !requestedTarget) return { changed: false };
      const parent = command.parentId
        ? getNode(editor, command.parentId)
        : (requestedTarget?.parent() ?? root);
      if (!parent || !canInsertDefinition(parent, command.definition)) {
        return { changed: false };
      }
      const safeDefinition = definitionWithFreshIds(root, command.definition);
      const previousHistoryEntries = new Set(getHistoryEntries(editor));
      let at: number | undefined;
      if (requestedTarget) {
        if (requestedTarget.parent() !== parent) return { changed: false };
        at = requestedTarget.index() + (command.position === 'after' ? 1 : 0);
      }
      const created = parent.append(
        safeDefinition,
        at === undefined ? undefined : { at },
      );
      if (definitionOpenNodeType(command.definition)) repairOpenBehaviorsAfterMove(root);
      if (safeDefinition.components !== undefined) {
        groupNewHistoryActions(editor, previousHistoryEntries);
      }
      const selection = created[0];
      return selection ? { changed: true, selection } : { changed: false };
    }
    case 'insert-child': {
      const parent = getNode(editor, command.parentId);
      if (!parent || !canInsertLiveType(parent, command.childType, command.slotName)) {
        return { changed: false };
      }
      const openParentType = openNodeType(parent);
      const definition = openParentType
        ? createOpenCompositionNodeDefinition(
            command.childType as OpenCompositionNodeType,
            {
              ...(openParentType === 'form' ? { formNodeId: command.parentId } : {}),
            },
          )
        : createBlockDefinition(command.childType as BuilderBlockType);
      if (!openParentType) {
        definition.attributes = {
          ...(definition.attributes ?? {}),
          [BUILDER_NODE_SLOT_ATTRIBUTE]: command.slotName,
        };
      }
      const safeDefinition = definitionWithFreshIds(root, definition);
      const previousHistoryEntries = new Set(getHistoryEntries(editor));
      const created = parent.append(safeDefinition, { at: command.index });
      repairOpenBehaviorsAfterMove(root);
      if (safeDefinition.components !== undefined) {
        groupNewHistoryActions(editor, previousHistoryEntries);
      }
      const selection = created[0];
      return selection ? { changed: true, selection } : { changed: false };
    }
    case 'insert-structural-child': {
      const parent = getNode(editor, command.parentId);
      if (parent && openNodeType(parent)) {
        return executeEditorCommand(editor, {
          kind: 'insert-child',
          parentId: command.parentId,
          slotName: command.slotName ?? '',
          childType: command.childType,
        });
      }
      const parentType = parent && payloadNodeType(parent);
      if (!parent || !parentType || !isBuilderNodeType(command.childType)) {
        return { changed: false };
      }
      const slot = command.slotName
        ? PAGE_COMPONENT_REGISTRY[parentType].slots.find(
            (candidate) => candidate.name === command.slotName,
          )
        : resolveSlotForChild(parentType, command.childType);
      if (!slot) return { changed: false };
      return executeEditorCommand(editor, {
        kind: 'insert-child',
        parentId: command.parentId,
        slotName: slot.name,
        childType: command.childType,
      });
    }
    case 'move': {
      const previousHistoryEntries = new Set(getHistoryEntries(editor));
      const result = moveNodeByIntent(root, command.intent);
      if (!result.valid) return { changed: false };
      repairOpenBehaviorsAfterMove(root);
      groupNewHistoryActions(editor, previousHistoryEntries);
      return { changed: true, selection: result.source };
    }
    case 'remove': {
      const node = getNode(editor, command.nodeId);
      if (!node || !canRemoveLiveNode(root, node)) return { changed: false };
      const removedNodeIds = collectComponentNodeIds(node);
      const fallback = node.parent() ?? root;
      editor.select(node);
      editor.runCommand('core:component-delete');
      pruneOpenBehaviorsAfterRemoval(root, removedNodeIds);
      return { changed: true, selection: fallback };
    }
    case 'duplicate': {
      const node = getNode(editor, command.nodeId);
      if (!node || !canDuplicateLiveNode(root, node)) return { changed: false };
      const parent = node.parent();
      if (!parent) return { changed: false };
      const sourceDefinition = definitionFromComponent(node);
      const safeDefinition = definitionWithFreshIds(root, sourceDefinition);
      const previousHistoryEntries = new Set(getHistoryEntries(editor));
      const created = parent.append(safeDefinition, { at: node.index() + 1 });
      duplicateOpenBehaviors(root, node, safeDefinition);
      repairOpenBehaviorsAfterMove(root);
      const selection = created[0];
      if (selection) editor.select(selection);
      groupNewHistoryActions(editor, previousHistoryEntries);
      return selection ? { changed: true, selection } : { changed: true };
    }
    case 'detach-reusable': {
      const node = getNode(editor, command.nodeId);
      const parent = node?.parent();
      if (
        !node ||
        !parent ||
        payloadNodeType(node) !== 'reusable-instance' ||
        !canInsertDefinition(parent, command.definition)
      ) {
        return { changed: false };
      }
      const safeDefinition = definitionWithFreshIds(root, command.definition);
      const previousHistoryEntries = new Set(getHistoryEntries(editor));
      const at = node.index();
      editor.select(node);
      editor.runCommand('core:component-delete');
      const created = parent.append(safeDefinition, { at });
      const selection = created[0];
      if (selection) editor.select(selection);
      groupNewHistoryActions(editor, previousHistoryEntries);
      return selection ? { changed: true, selection } : { changed: true };
    }
    case 'apply-global-preset': {
      const node = getNode(editor, command.nodeId);
      if (!globalPresetTargetIsValid(root, node, command.definition)) {
        return { changed: false };
      }
      if (!node) return { changed: false };
      const safeDefinition = definitionWithFreshIds(root, command.definition);
      const previousHistoryEntries = new Set(getHistoryEntries(editor));
      const components = Array.isArray(safeDefinition.components)
        ? safeDefinition.components
        : safeDefinition.components
          ? [safeDefinition.components]
          : [];
      node.components(components);
      groupNewHistoryActions(editor, previousHistoryEntries);
      return { changed: true, selection: node };
    }
    case 'set-content': {
      return executeEditorCommand(editor, {
        kind: 'update-props',
        nodeId: command.nodeId,
        content: command.content,
      });
    }
    case 'set-property': {
      const node = getNode(editor, command.nodeId);
      if (!node) return { changed: false };
      if (openNodeType(node)) {
        const previousHistoryEntries = new Set(getHistoryEntries(editor));
        const changed = updateOpenProperty(node, command.property, command.value);
        if (changed) groupNewHistoryActions(editor, previousHistoryEntries);
        return changed ? { changed: true, selection: node } : { changed: false };
      }
      const type = node.getAttributes({ noStyle: true })[BUILDER_NODE_TYPE_ATTRIBUTE];
      if (!isBuilderNodeType(type)) return { changed: false };
      const update = getComponentEditorCodec(type).resolvePropertyMutation(
        type,
        command.property,
        command.value,
        node,
      );
      if (!update) return { changed: false };
      const previousHistoryEntries =
        type === 'accordion-item' && command.property === 'defaultOpen'
          ? new Set(getHistoryEntries(editor))
          : undefined;
      const changed = applyEditorPropertyUpdate(node, type, update);
      if (changed && previousHistoryEntries) {
        // Opening an item in a single-open accordion changes the item and any
        // open siblings. Give all model actions one GrapesJS fusion marker so
        // one Undo restores the complete semantic transition.
        groupNewHistoryActions(editor, previousHistoryEntries);
      }
      return changed ? { changed: true, selection: node } : { changed: false };
    }
    case 'set-attributes': {
      return executeEditorCommand(editor, {
        kind: 'update-props',
        nodeId: command.nodeId,
        attributes: command.attributes,
      });
    }
    case 'update-props': {
      const node = getNode(editor, command.nodeId);
      if (!node) return { changed: false };
      const nodeType = node.getAttributes({ noStyle: true })[BUILDER_NODE_TYPE_ATTRIBUTE];
      if (command.components && nodeType !== 'form' && nodeType !== 'countdown') {
        return { changed: false };
      }
      if (command.content !== undefined) {
        node.set('content', sanitizeInlineText(command.content));
      }
      if (command.attributes) {
        const safeAttributes = Object.fromEntries(
          Object.entries(command.attributes).filter(
            ([key]) => key !== 'data-payload-node-id' && key !== 'data-payload-node-type',
          ),
        );
        node.setAttributes({
          ...node.getAttributes({ noStyle: true }),
          ...safeAttributes,
        });
      }
      if (command.components) node.components(command.components);
      return { changed: true, selection: node };
    }
    case 'set-style': {
      const node = getNode(editor, command.nodeId);
      if (!node) return { changed: false };
      node.setStyle(command.style);
      return { changed: true, selection: node };
    }
    case 'set-responsive-style': {
      const node = getNode(editor, command.nodeId);
      if (!node) return { changed: false };
      const changed = updateEditorViewportStyle(
        node,
        command.viewport,
        command.property,
        command.value,
        options.designSystem,
      );
      return changed ? { changed: true, selection: node } : { changed: false };
    }
    case 'set-part-responsive-style': {
      const node = getNode(editor, command.nodeId);
      if (!node) return { changed: false };
      const type = payloadNodeType(node);
      if (!type) return { changed: false };
      const changed = updateEditorPartViewportStyle(
        node,
        type,
        command.partName,
        command.viewport,
        command.property,
        command.value,
        options.designSystem,
      );
      return changed ? { changed: true, selection: node } : { changed: false };
    }
    case 'undo': {
      if (!editor.UndoManager.hasUndo()) return { changed: false };
      const undoManager = editor.UndoManager as typeof editor.UndoManager & {
        undo?: (all?: boolean) => void;
      };
      if (typeof undoManager.undo === 'function') undoManager.undo(true);
      else editor.runCommand('core:undo');
      const selection = editor.getSelected() ?? root;
      return selection ? { changed: true, selection } : { changed: true };
    }
    case 'redo': {
      if (!editor.UndoManager.hasRedo()) return { changed: false };
      const undoManager = editor.UndoManager as typeof editor.UndoManager & {
        redo?: (all?: boolean) => void;
      };
      if (typeof undoManager.redo === 'function') undoManager.redo(true);
      else editor.runCommand('core:redo');
      const selection = editor.getSelected() ?? root;
      return selection ? { changed: true, selection } : { changed: true };
    }
  }
}
