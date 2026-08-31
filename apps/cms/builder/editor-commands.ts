import type { Component, ComponentDefinition, Editor } from 'grapesjs';
import {
  PAGE_COMPONENT_REGISTRY,
  PAGE_STYLE_PROPERTY_BY_EDITOR_KEY,
  canDuplicateInSlot,
  canInsertIntoSlot,
  canRemoveFromSlot,
  resolveSlotForChild,
  resolveSlotsForChild,
  type ComponentSlotDefinition,
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
  BUILDER_NODE_SLOT_ATTRIBUTE,
  createBlockDefinition,
  isBuilderNodeType,
  reassignEditorNodeIds,
  sanitizeInlineText,
  updateEditorViewportStyle,
  updateEditorPartViewportStyle,
  type BuilderViewport,
  type BuilderBlockType,
  type BuilderNodeType,
} from './builder-adapter';
import {
  applyEditorPropertyUpdate,
  getComponentEditorCodec,
} from './component-editor-codecs';

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
      value: string;
      viewport: BuilderViewport;
    }
  | {
      kind: 'set-part-responsive-style';
      nodeId: string;
      partName: string;
      property: string;
      value: string;
      viewport: BuilderViewport;
    }
  | {
      kind: 'insert-child';
      parentId: string;
      slotName: string;
      childType: BuilderBlockType;
      index?: number;
    }
  /** @deprecated Kept as a compatibility shim for older callers. */
  | {
      kind: 'insert-structural-child';
      parentId: string;
      childType: BuilderBlockType;
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

type HistoryEntry = { set?: (key: string, value: unknown) => void };

function getHistoryEntries(editor: Editor): HistoryEntry[] {
  const getStack = (editor.UndoManager as unknown as { getStack?: () => unknown })
    .getStack;
  if (typeof getStack !== 'function') return [];
  const stack = getStack.call(editor.UndoManager) as
    { models?: HistoryEntry[] } | HistoryEntry[];
  return Array.isArray(stack) ? stack : (stack.models ?? []);
}

function isolateNewHistoryActions(
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

function liveSlotOccupancy(
  parent: Component,
  slot: ComponentSlotDefinition,
  excluded?: Component,
): { count: number; bySlot: Record<string, number> } {
  const count = parent.components().models.filter((child) => {
    if (child === excluded) return false;
    const attributes = child.getAttributes({ noStyle: true });
    const ownedSlot = attributes[BUILDER_NODE_SLOT_ATTRIBUTE];
    return typeof ownedSlot === 'string'
      ? ownedSlot === slot.name
      : slot.accepts.includes(payloadNodeType(child) as never);
  }).length;
  return { count, bySlot: { [slot.name]: count } };
}

function liveSlotForChild(
  parent: Component | undefined,
  childType: BuilderNodeType,
): ComponentSlotDefinition | undefined {
  const parentType = parent && payloadNodeType(parent);
  return parentType ? resolveSlotsForChild(parentType, childType)[0] : undefined;
}

function canRemoveLiveNode(root: Component, node: Component): boolean {
  if (node === root) return false;
  const parent = node.parent();
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
  const parentType = parent.getAttributes({ noStyle: true })[BUILDER_NODE_TYPE_ATTRIBUTE];
  const childType = definitionNodeType(definition);
  if (!isBuilderNodeType(parentType) || !childType) return false;
  const slot = slotName
    ? PAGE_COMPONENT_REGISTRY[parentType].slots.find(
        (candidate) => candidate.name === slotName,
      )
    : resolveSlotForChild(parentType, childType);
  // `droppable` is presentation behavior; command validation remains domain
  // driven and therefore also applies to Quick Add, Layers and keyboard paths.
  return Boolean(
    slot &&
    canInsertIntoSlot({
      parentType,
      slotName: slot.name,
      childType,
      occupancy: liveSlotOccupancy(parent, slot),
    }),
  );
}

function canInsertLiveType(
  parent: Component,
  childType: BuilderNodeType,
  slotName?: string,
): boolean {
  const parentType = payloadNodeType(parent);
  if (!parentType) return false;
  const slot = slotName
    ? PAGE_COMPONENT_REGISTRY[parentType].slots.find(
        (candidate) => candidate.name === slotName,
      )
    : resolveSlotForChild(parentType, childType);
  return Boolean(
    slot &&
    slot.structural &&
    canInsertIntoSlot({
      parentType,
      slotName: slot.name,
      childType,
      occupancy: liveSlotOccupancy(parent, slot),
    }),
  );
}

export function createEditorCommandBus(editor: Editor): BuilderCommandBus {
  const bus: BuilderCommandBus = {
    dispatch: (command) => {
      if (!bus.canDispatch(command)) return { changed: false };
      try {
        return executeEditorCommand(editor, command);
      } catch {
        // A command is a safety boundary for untrusted inspector values. The
        // caller can treat a failed dispatch as a no-op and keep the live
        // document intact.
        return { changed: false };
      }
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
        const parentType = payloadNodeType(parent);
        if (!parentType) return false;
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
      if (command.kind === 'set-property') {
        const node = getNode(editor, command.nodeId);
        if (!node) return false;
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
): EditorCommandResult {
  const root = getRoot(editor);
  if (!root) return { changed: false };

  switch (command.kind) {
    case 'insert': {
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
      let at: number | undefined;
      if (requestedTarget) {
        if (requestedTarget.parent() !== parent) return { changed: false };
        at = requestedTarget.index() + (command.position === 'after' ? 1 : 0);
      }
      const created = parent.append(
        command.definition,
        at === undefined ? undefined : { at },
      );
      const selection = created[0];
      return selection ? { changed: true, selection } : { changed: false };
    }
    case 'insert-child': {
      const parent = getNode(editor, command.parentId);
      if (!parent || !canInsertLiveType(parent, command.childType, command.slotName)) {
        return { changed: false };
      }
      const definition = createBlockDefinition(command.childType);
      definition.attributes = {
        ...(definition.attributes ?? {}),
        [BUILDER_NODE_SLOT_ATTRIBUTE]: command.slotName,
      };
      const created = parent.append(definition, { at: command.index });
      const selection = created[0];
      return selection ? { changed: true, selection } : { changed: false };
    }
    case 'insert-structural-child': {
      const parent = getNode(editor, command.parentId);
      const parentType = parent && payloadNodeType(parent);
      if (!parent || !parentType) return { changed: false };
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
      const result = moveNodeByIntent(root, command.intent);
      if (!result.valid) return { changed: false };
      return { changed: true, selection: result.source };
    }
    case 'remove': {
      const node = getNode(editor, command.nodeId);
      if (!node || !canRemoveLiveNode(root, node)) return { changed: false };
      const fallback = node.parent() ?? root;
      editor.select(node);
      editor.runCommand('core:component-delete');
      return { changed: true, selection: fallback };
    }
    case 'duplicate': {
      const node = getNode(editor, command.nodeId);
      if (!node || !canDuplicateLiveNode(root, node)) return { changed: false };
      const parent = node.parent();
      const existingChildren = parent?.components().models.slice() ?? [];
      const previousHistoryEntries = new Set(getHistoryEntries(editor));
      editor.select(node);
      editor.runCommand('tlb-clone');
      // GrapesJS does not promise that `tlb-clone` leaves the clone selected.
      // Resolve the newly added sibling by identity so ID repair never mutates
      // the source node while leaving its duplicate with a stale Page ID.
      const clone = parent
        ?.components()
        .models.find((candidate) => !existingChildren.includes(candidate));
      const selection = clone ?? editor.getSelected();
      const duplicate = clone ?? selection;
      if (duplicate) {
        // Native clone events are guarded in GrapesEditor, but the command
        // itself owns the identity transition so every command invocation
        // produces a fresh PagePayload subtree without an extra undo action.
        editor.getModel().skip(() => reassignEditorNodeIds(duplicate));
      }
      if (clone) editor.select(clone);
      isolateNewHistoryActions(editor, previousHistoryEntries);
      return selection ? { changed: true, selection } : { changed: true };
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
      const type = node.getAttributes({ noStyle: true })[BUILDER_NODE_TYPE_ATTRIBUTE];
      if (!isBuilderNodeType(type)) return { changed: false };
      const update = getComponentEditorCodec(type).resolvePropertyMutation(
        type,
        command.property,
        command.value,
        node,
      );
      if (!update) return { changed: false };
      return applyEditorPropertyUpdate(node, type, update)
        ? { changed: true, selection: node }
        : { changed: false };
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
      );
      return changed ? { changed: true, selection: node } : { changed: false };
    }
    case 'undo': {
      if (!editor.UndoManager.hasUndo()) return { changed: false };
      editor.runCommand('core:undo');
      const selection = editor.getSelected() ?? root;
      return selection ? { changed: true, selection } : { changed: true };
    }
    case 'redo': {
      if (!editor.UndoManager.hasRedo()) return { changed: false };
      editor.runCommand('core:redo');
      const selection = editor.getSelected() ?? root;
      return selection ? { changed: true, selection } : { changed: true };
    }
  }
}
