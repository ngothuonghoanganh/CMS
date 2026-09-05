'use client';

import type { BlockProperties, Component, ComponentDefinition, Editor } from 'grapesjs';
import {
  BuilderAdapterError,
  BUILDER_FORM_PREVIEW_ATTRIBUTE,
  BUILDER_NODE_ID_ATTRIBUTE,
  BUILDER_NODE_TYPE_ATTRIBUTE,
  BUILDER_NODE_SLOT_ATTRIBUTE,
  BUILDER_PAYLOAD_VERSION_ATTRIBUTE,
  BUILDER_FORM_PROPS_ATTRIBUTE,
  BUILDER_COUNTDOWN_PROPS_ATTRIBUTE,
  type BuilderNodeType,
  type BuilderBlockType,
  type BuilderViewport,
  applyEditorViewportStyle,
  applyEditorPartViewportStyles,
  createBlockDefinition,
  createExtensionBlockDefinition,
  createReusableInstanceDefinition,
  reusableDocumentToEditorDefinition,
  countdownPreviewComponents,
  formPreviewComponents,
  isBuilderNodeType,
  payloadToEditorComponent,
  serializeGrapesComponent,
  serializeReusableSubtree,
  snapshotFromGrapesComponent,
  siteGlobalDocumentToEditorDefinition,
} from './builder-adapter';
import {
  findPayloadComponent,
  isEditableTarget,
  isEditorOnlyPreview,
  payloadAncestor,
  payloadNodeId,
  payloadNodeType,
  validateNodeIntent,
  type DropPosition,
  type MoveNodeIntent,
  type MoveNodeResult,
  selectedMoveIntent,
} from './builder-interaction';
import {
  createEditorCommandBus,
  executeEditorCommand,
  type EditorCommand,
  type EditorCommandResult,
} from './editor-commands';
import { createEditorPropertyCommand } from './component-editor-bindings';
import { BuilderSelection } from './builder-selection';
import {
  BUILDER_BLOCK_PRESET_REGISTRY,
  createGlobalPresetDefinition,
  createBlockPresetDefinition,
  isGlobalPresetId,
  type BlockPresetId,
  type GlobalPresetId,
  type BuilderInsertable,
} from './block-presets';
import type { BuilderCanvasNode, BuilderCanvasState } from './builder-minimap';
import { forwardRef, useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import {
  CountdownPropsSchema,
  FormPropsSchema,
  PAGE_RUNTIME_CLASS_NAMES,
  PAGE_RUNTIME_BASELINE_CSS,
  PAGE_RESPONSIVE_BREAKPOINTS,
  PAGE_COMPONENT_REGISTRY,
  createPageDocument,
  resolveSlotsForChild,
  type FormProps,
  type PageDocument,
  type PageCompositionFields,
  type PagePayload,
  type SiteGlobalPayloadV1,
  type BuilderDocumentKind,
  type ReusableComponentDocument,
  type ReusableRuntime,
  type SiteDesignSystem,
  type StyleTokenReference,
  type ResolvedNavigationItem,
} from '@payload/contracts';

import {
  selectionFromComponentCodec,
  type ComponentSelectionSnapshot,
} from './component-editor-codecs';
import { canInsertLiveChild } from './builder-structural-domain';
import { collectPersistedNodeIds, remapSubtreeNodeIds } from './builder-node-identity';
import {
  scopeForDocumentKind,
  validationIssueFromError,
  type BuilderValidationIssue,
} from './builder-validation';
import { compositionFieldsFromPayload, pageDocumentSignature } from './page-composition';

export type SelectedBuilderNode = ComponentSelectionSnapshot;

type BuilderDebugApi = {
  getPayload: () => PagePayload | SiteGlobalPayloadV1;
  setCanvasZoom: (zoom: number) => void;
};

declare global {
  interface Window {
    __payloadBuilderDebug?: BuilderDebugApi;
  }
}

export type GrapesEditorHandle = {
  addBlock: (type: BuilderInsertable) => void;
  addExtensionBlock: (extensionId: string) => void;
  addLayoutExtension: (document: SiteGlobalPayloadV1) => void;
  startBlockDrag: (type: BuilderInsertable, event: Event) => void;
  startLayoutExtensionDrag: (document: SiteGlobalPayloadV1, event: Event) => void;
  duplicateSelected: () => void;
  deleteSelected: () => void;
  undo: () => void;
  redo: () => void;
  getDocument: () => PageDocument | SiteGlobalPayloadV1;
  serialize: () => PagePayload | SiteGlobalPayloadV1;
  acknowledgeSaved: (
    payload: PagePayload | SiteGlobalPayloadV1,
    composition?: PageCompositionFields,
  ) => void;
  setWorkingComposition: (composition: PageCompositionFields) => void;
  setViewport: (viewport: BuilderViewport) => void;
  updateSelectedText: (value: string) => void;
  updateSelectedProperty: (property: string, value: unknown) => void;
  updateSelectedAttribute: (
    name: 'href' | 'target' | 'src' | 'alt',
    value: string,
  ) => void;
  updateSelectedStyle: (property: string, value: string | StyleTokenReference) => void;
  resetSelectedStyle: (property: string) => void;
  updateSelectedPartStyle: (
    partName: string,
    property: string,
    value: string | StyleTokenReference,
  ) => void;
  resetSelectedPartStyle: (partName: string, property: string) => void;
  updateSelectedForm: (form: FormProps) => void;
  updateSelectedCountdown: (props: { targetAt: string; label: string }) => void;
  selectAsset: (src: string) => void;
  selectNode: (id: string) => void;
  selectParent: () => void;
  insertBlock: (
    type: BuilderInsertable,
    placement?: { targetNodeId: string; position: DropPosition },
  ) => boolean;
  addStructuralChild: (slotName?: string, childType?: BuilderBlockType) => boolean;
  removeStructuralChild: (nodeId: string) => boolean;
  moveStructuralChild: (nodeId: string, direction: 'up' | 'down') => boolean;
  duplicateStructuralChild: (nodeId: string) => boolean;
  validateMove: (intent: MoveNodeIntent) => { valid: boolean; reason?: string };
  scrollToCanvasPoint: (x: number, y: number) => void;
  setCanvasZoom: (zoom: number) => void;
  fitCanvas: () => void;
  setInteractionMode: (mode: InteractionMode) => void;
  moveNode: (intent: MoveNodeIntent) => boolean;
  moveSelected: (direction: 'up' | 'down' | 'outdent' | 'indent') => boolean;
  insertReusable: (
    reusableId: string,
    mode: 'copy' | 'linked',
    placement?: { targetNodeId: string; position: DropPosition },
  ) => boolean;
  getSelectedReusableDocument: () => ReusableComponentDocument | null;
  detachSelectedReusable: (document: ReusableComponentDocument) => boolean;
};

export type InteractionMode = 'select' | 'hand';

type GrapesEditorProps = {
  documentKind: BuilderDocumentKind;
  pageId?: string;
  initialPayload: PagePayload | SiteGlobalPayloadV1;
  initialComposition?: PageCompositionFields;
  reusableRuntime?: readonly ReusableRuntime[];
  designSystem?: SiteDesignSystem;
  siteName?: string;
  siteLogo?: string;
  navigation?: {
    main?: readonly ResolvedNavigationItem[];
    footer?: readonly ResolvedNavigationItem[];
  };
  onDirty: () => void;
  onDocumentChange: (document: PageDocument | SiteGlobalPayloadV1) => void;
  onSelectionChange: (node: SelectedBuilderNode | null) => void;
  onReady: () => void;
  onHistoryChange: (state: { canUndo: boolean; canRedo: boolean }) => void;
  onCanvasStateChange: (state: BuilderCanvasState) => void;
  onInteractionModeChange: (mode: InteractionMode) => void;
  onError: (message: string) => void;
  onValidationIssue?: (issue: BuilderValidationIssue) => void;
  validationIssues?: readonly BuilderValidationIssue[];
};

const allViewports: BuilderViewport[] = ['desktop', 'tablet', 'mobile'];

function isPayloadNodeType(value: unknown): value is BuilderNodeType {
  return isBuilderNodeType(value);
}

function canInsertIntoComponent(
  parent: Component,
  childType: BuilderNodeType,
  excluded?: Component,
): boolean {
  const parentType = payloadNodeType(parent);
  if (!parentType) return false;
  return canInsertLiveChild(parent, childType, excluded);
}

function selectionFromComponent(
  component: Component | undefined,
): SelectedBuilderNode | null {
  return selectionFromComponentCodec(component);
}

function formPropsFromComponent(component: Component): FormProps | undefined {
  const raw = component.getAttributes({ noStyle: true })[BUILDER_FORM_PROPS_ATTRIBUTE];
  if (typeof raw !== 'string') return undefined;
  try {
    const parsed = FormPropsSchema.safeParse(JSON.parse(raw) as unknown);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function ensureFormPreview(component: Component): void {
  const form = formPropsFromComponent(component);
  if (!form) return;
  const children = component.components().models;
  const expectedChildCount = form.fields.length + 1;
  const hasPreviewChildren = children.every(
    (child) =>
      child.getAttributes({ noStyle: true })['data-payload-form-preview'] !== undefined,
  );
  if (children.length !== expectedChildCount || !hasPreviewChildren) {
    component.components(formPreviewComponents(form));
  }
}

function ensureAllFormPreviews(root: Component): void {
  root.onAll((component) => {
    const type = component.getAttributes({ noStyle: true })[BUILDER_NODE_TYPE_ATTRIBUTE];
    if (type === 'form') ensureFormPreview(component);
  });
}

/**
 * Runtime classes are painted onto the iframe DOM only. Keeping them out of
 * the GrapesJS component model avoids its selector manager treating preview
 * descendants as editable class selectors while preserving production CSS.
 */
function syncRuntimePreviewClasses(root: Component): void {
  const rootElement = root.getEl();
  const frameDocument = rootElement?.ownerDocument;
  if (frameDocument) {
    frameDocument
      .querySelectorAll<HTMLElement>('[data-payload-node-type="form"]')
      .forEach((element) => element.classList.add(PAGE_RUNTIME_CLASS_NAMES.form));
    frameDocument
      .querySelectorAll<HTMLElement>('[data-payload-form-preview="field"]')
      .forEach((element) => element.classList.add(PAGE_RUNTIME_CLASS_NAMES.formField));
    frameDocument
      .querySelectorAll<HTMLElement>(
        '[data-payload-form-preview="control"][role="radiogroup"]',
      )
      .forEach((element) => element.classList.add(PAGE_RUNTIME_CLASS_NAMES.formOptions));
  }
  root.onAll((component) => {
    const attributes = component.getAttributes({ noStyle: true });
    const element = component.getEl();
    if (!element) return;
    const type = attributes[BUILDER_NODE_TYPE_ATTRIBUTE];
    if (type === 'form') element.classList.add(PAGE_RUNTIME_CLASS_NAMES.form);
    if (attributes[BUILDER_FORM_PREVIEW_ATTRIBUTE] === 'field') {
      element.classList.add(PAGE_RUNTIME_CLASS_NAMES.formField);
    }
    if (
      attributes[BUILDER_FORM_PREVIEW_ATTRIBUTE] === 'control' &&
      attributes.role === 'radiogroup'
    ) {
      element.classList.add(PAGE_RUNTIME_CLASS_NAMES.formOptions);
    }
  });
}

function syncValidationIndicators(
  root: Component,
  issues: readonly BuilderValidationIssue[],
): void {
  const invalidNodeIds = new Set(
    issues
      .filter((issue) => issue.severity === 'error' && issue.nodeId)
      .map((issue) => issue.nodeId),
  );
  const paint = (component: Component) => {
    const nodeId = payloadNodeId(component);
    const element = component.getEl();
    if (!element || !nodeId) return;
    const invalid = invalidNodeIds.has(nodeId);
    element.classList.toggle('builder-validation-node-invalid', invalid);
    if (invalid) {
      element.setAttribute('data-builder-validation-node', 'true');
    } else {
      element.removeAttribute('data-builder-validation-node');
    }
  };
  paint(root);
  root.onAll(paint);
}

function componentForCanvasElement(root: Component, element: Element): Component | null {
  let match: Component | undefined;
  root.onAll((component) => {
    if (isEditorOnlyPreview(component)) return;
    const componentElement = component.getEl();
    if (!componentElement || !componentElement.contains(element)) return;
    if (!match || (match.getEl()?.contains(componentElement) ?? false)) {
      match = component;
    }
  });
  return match ?? null;
}

function componentForCanvasPoint(
  root: Component,
  frameDocument: Document,
  x: number,
  y: number,
): Component | null {
  const element = frameDocument.elementFromPoint(x, y);
  if (element) {
    const match = componentForCanvasElement(root, element);
    if (match) return match;
  }

  // Browser iframe hit-testing can briefly use parent-document coordinates
  // while the frame is resizing. Resolve the deepest laid-out component as a
  // geometry fallback so Add-panel drag remains usable in that window.
  let match: Component | undefined;
  root.onAll((component) => {
    if (isEditorOnlyPreview(component)) return;
    const componentElement = component.getEl();
    if (!componentElement) return;
    const rect = componentElement.getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;
    if (!match || (match.getEl()?.contains(componentElement) ?? false)) {
      match = component;
    }
  });
  return match ?? null;
}

function canvasDropIntent(
  root: Component,
  source: Component,
  element: Element | null,
  clientX: number,
  clientY: number,
  previous?: MoveNodeIntent,
): MoveNodeIntent | undefined {
  if (!element) return undefined;
  let target = componentForCanvasElement(root, element);
  const sourceId = payloadNodeId(source);
  const sourceType = payloadNodeType(source);
  if (!sourceId || !sourceType || !target || target === source) return undefined;
  const initialTargetElement = target.getEl();
  if (!initialTargetElement) return undefined;
  const initialRect = initialTargetElement.getBoundingClientRect();
  const initialHeight = Math.max(initialRect.height, 1);
  const initialEdge = Math.max(16, Math.min(48, initialHeight * 0.28));
  const initialPosition: DropPosition =
    clientY - initialRect.top < initialEdge
      ? 'before'
      : initialRect.bottom - clientY < initialEdge
        ? 'after'
        : 'inside';
  if (initialPosition === 'inside') {
    if (
      target &&
      !canInsertIntoComponent(
        target,
        sourceType,
        target.parent() === source.parent() ? source : undefined,
      )
    ) {
      const parent = payloadAncestor(target.parent());
      const parentType = parent ? payloadNodeType(parent) : undefined;
      if (
        parent &&
        parentType &&
        parentType !== 'root' &&
        canInsertIntoComponent(parent, sourceType)
      ) {
        target = parent;
      }
    }
  }
  const targetId = target ? payloadNodeId(target) : undefined;
  if (!target || !targetId || target === source) return undefined;
  const targetElement = target.getEl();
  if (!targetElement) return undefined;
  const rect = targetElement.getBoundingClientRect();
  const height = Math.max(rect.height, 1);
  const edge = Math.max(16, Math.min(48, height * 0.28));
  const previousPosition =
    previous?.targetNodeId === targetId ? previous.position : undefined;
  let position: DropPosition = 'inside';
  if (clientY - rect.top < edge) position = 'before';
  else if (rect.bottom - clientY < edge) position = 'after';
  if (previousPosition && previousPosition !== position) {
    const hysteresis = Math.min(12, edge * 0.35);
    const distanceFromTop = clientY - rect.top;
    const distanceFromBottom = rect.bottom - clientY;
    if (
      previousPosition === 'before' &&
      distanceFromTop < edge + hysteresis &&
      distanceFromBottom > edge - hysteresis
    ) {
      position = previousPosition;
    } else if (
      previousPosition === 'after' &&
      distanceFromBottom < edge + hysteresis &&
      distanceFromTop > edge - hysteresis
    ) {
      position = previousPosition;
    }
  }
  return { nodeId: sourceId, targetNodeId: targetId, position };
}

function setCanvasInteractionClass(
  editor: Editor,
  mode: InteractionMode,
  temporaryPan = false,
): void {
  const frameDocument = editor.Canvas.getFrameEl()?.contentDocument;
  const canvasElement = editor.Canvas.getCanvasView().el;
  frameDocument?.body.classList.toggle(
    'builder-hand-mode',
    mode === 'hand' || temporaryPan,
  );
  canvasElement.classList.toggle('builder-hand-mode', mode === 'hand' || temporaryPan);
}

function panCanvas(editor: Editor, deltaX: number, deltaY: number): void {
  const canvasElement = editor.Canvas.getCanvasView().el;
  const canScrollCanvas =
    canvasElement.scrollHeight > canvasElement.clientHeight + 1 ||
    canvasElement.scrollWidth > canvasElement.clientWidth + 1;
  if (canScrollCanvas) canvasElement.scrollBy(-deltaX, -deltaY);
  editor.Canvas.getFrameEl()?.contentWindow?.scrollBy(-deltaX, -deltaY);
}

function createDragFeedback(
  frameDocument: Document,
  source: Component,
): { ghost: HTMLElement | null; indicator: HTMLElement } {
  const indicator = frameDocument.createElement('div');
  indicator.className = 'builder-drop-indicator';
  indicator.setAttribute('aria-hidden', 'true');
  frameDocument.body.append(indicator);

  const sourceElement = source.getEl();
  let ghost: HTMLElement | null = null;
  if (sourceElement) {
    ghost = sourceElement.cloneNode(true) as HTMLElement;
    ghost.className = 'builder-drag-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
    frameDocument.body.append(ghost);
    const rect = sourceElement.getBoundingClientRect();
    Object.assign(ghost.style, {
      height: `${rect.height}px`,
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
    });
  }
  return { ghost, indicator };
}

function updateDropFeedback(
  indicator: HTMLElement,
  intent: MoveNodeIntent | undefined,
  result: MoveNodeResult | undefined,
  root: Component,
): void {
  indicator.className = `builder-drop-indicator${result?.valid === false ? ' invalid' : ''}`;
  if (result?.valid === false) {
    indicator.title = `Cannot drop here: ${result.reason}`;
    indicator.setAttribute('aria-label', `Cannot drop here: ${result.reason}`);
  } else {
    indicator.removeAttribute('title');
    indicator.setAttribute('aria-label', 'Drop insertion point');
  }
  if (!intent) {
    indicator.style.display = 'none';
    return;
  }
  const target = findPayloadComponent(root, intent.targetNodeId);
  const element = target?.getEl();
  if (!element) {
    indicator.style.display = 'none';
    return;
  }
  const rect = element.getBoundingClientRect();
  indicator.style.display = 'block';
  indicator.dataset.position = intent.position;
  if (intent.position === 'inside') {
    Object.assign(indicator.style, {
      height: `${Math.max(rect.height, 2)}px`,
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${Math.max(rect.width, 2)}px`,
    });
  } else {
    Object.assign(indicator.style, {
      height: '3px',
      left: `${rect.left}px`,
      top: `${intent.position === 'before' ? rect.top - 2 : rect.bottom - 1}px`,
      width: `${Math.max(rect.width, 2)}px`,
    });
  }
}

function bindCanvasComponentDrag(
  editor: Editor,
  modeRef: { current: InteractionMode },
  temporaryPanRef: { current: boolean },
  commitMove: (intent: MoveNodeIntent) => boolean,
  onCanvasKeyDown?: (event: KeyboardEvent) => void,
): (() => void) | undefined {
  const frame = editor.Canvas.getFrameEl();
  const frameDocument = frame?.contentDocument;
  if (!frameDocument) return undefined;

  let state:
    | (
        | {
            kind: 'drag';
            source: Component;
            startX: number;
            startY: number;
            dragging: boolean;
            intent?: MoveNodeIntent;
            feedback?: { ghost: HTMLElement | null; indicator: HTMLElement };
          }
        | {
            kind: 'pan';
            startX: number;
            startY: number;
          }
      )
    | undefined;
  let autoScrollFrame: number | null = null;
  let autoScrollDeltaY = 0;

  const stopAutoScroll = () => {
    autoScrollDeltaY = 0;
    if (autoScrollFrame !== null) {
      window.cancelAnimationFrame(autoScrollFrame);
      autoScrollFrame = null;
    }
  };
  const startAutoScroll = () => {
    if (autoScrollFrame !== null) return;
    const tick = () => {
      autoScrollFrame = null;
      if (!state || state.kind !== 'drag' || !state.dragging || !autoScrollDeltaY) {
        return;
      }
      const canvasElement = editor.Canvas.getCanvasView().el;
      const frameDocument = editor.Canvas.getFrameEl()?.contentDocument;
      const frameScrollTop = frameDocument?.scrollingElement?.scrollTop ?? 0;
      const canScroll =
        autoScrollDeltaY > 0
          ? canvasElement.scrollTop > 0 || frameScrollTop > 0
          : canvasElement.scrollTop + canvasElement.clientHeight <
              canvasElement.scrollHeight - 1 ||
            (frameDocument !== null &&
              frameDocument !== undefined &&
              frameScrollTop +
                (frameDocument.defaultView?.innerHeight ??
                  frameDocument.documentElement.clientHeight) <
                frameDocument.documentElement.scrollHeight - 1);
      if (!canScroll) {
        stopAutoScroll();
        return;
      }
      panCanvas(editor, 0, autoScrollDeltaY);
      autoScrollFrame = window.requestAnimationFrame(tick);
    };
    autoScrollFrame = window.requestAnimationFrame(tick);
  };

  const cleanupState = () => {
    stopAutoScroll();
    if (state?.kind === 'drag') {
      state.feedback?.ghost?.remove();
      state.feedback?.indicator.remove();
      state.source.getEl()?.classList.remove('builder-drag-source');
    }
    state = undefined;
    document.body.classList.remove('builder-component-dragging');
    document.body.classList.remove('builder-canvas-panning');
    setCanvasInteractionClass(editor, modeRef.current);
  };
  const onMove = (event: MouseEvent) => {
    if (!state) return;
    if (state.kind === 'pan') {
      panCanvas(editor, event.clientX - state.startX, event.clientY - state.startY);
      state.startX = event.clientX;
      state.startY = event.clientY;
      event.preventDefault();
      return;
    }
    const distance = Math.hypot(
      event.clientX - state.startX,
      event.clientY - state.startY,
    );
    if (!state.dragging && distance < 4) return;
    state.dragging = true;
    document.body.classList.add('builder-component-dragging');
    if (!state.feedback) {
      state.feedback = createDragFeedback(frameDocument, state.source);
      const sourceElement = state.source.getEl();
      if (sourceElement) sourceElement.classList.add('builder-drag-source');
    }
    if (state.feedback.ghost) {
      state.feedback.ghost.style.left = `${event.clientX + 12}px`;
      state.feedback.ghost.style.top = `${event.clientY + 12}px`;
    }
    const root = editor.getComponents().models[0];
    const element = frameDocument.elementFromPoint(event.clientX, event.clientY);
    if (root) {
      const nextIntent = canvasDropIntent(
        root,
        state.source,
        element,
        event.clientX,
        event.clientY,
        state.intent,
      );
      if (nextIntent) state.intent = nextIntent;
      else delete state.intent;
      const result = state.intent ? validateNodeIntent(root, state.intent) : undefined;
      updateDropFeedback(state.feedback.indicator, state.intent, result, root);
    }
    const frameHeight =
      frameDocument.defaultView?.innerHeight ??
      frameDocument.documentElement.clientHeight;
    const edge = 56;
    const canvasElement = editor.Canvas.getCanvasView().el;
    const frameScrollTop = frameDocument.scrollingElement?.scrollTop ?? 0;
    const canScrollUp = canvasElement.scrollTop > 0 || frameScrollTop > 0;
    const canScrollDown =
      canvasElement.scrollTop + canvasElement.clientHeight <
        canvasElement.scrollHeight - 1 ||
      frameScrollTop + frameHeight < frameDocument.documentElement.scrollHeight - 1;
    autoScrollDeltaY = 0;
    if (event.clientY < edge && canScrollUp) {
      autoScrollDeltaY = Math.max(4, (edge - event.clientY) / 4);
    } else if (event.clientY > frameHeight - edge && canScrollDown) {
      autoScrollDeltaY = -Math.max(4, (event.clientY - (frameHeight - edge)) / 4);
    }
    if (autoScrollDeltaY) startAutoScroll();
    else stopAutoScroll();
    event.preventDefault();
  };
  const onUp = (event: MouseEvent) => {
    if (!state) return;
    const current = state;
    cleanupState();
    if (current.kind === 'pan' || !current.dragging) return;
    const root = editor.getComponents().models[0];
    if (root) {
      const intent =
        current.intent ??
        canvasDropIntent(
          root,
          current.source,
          event.target instanceof Element ? event.target : null,
          event.clientX,
          event.clientY,
        );
      if (intent) {
        commitMove(intent);
      }
    }
  };
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && state) {
      cleanupState();
      event.preventDefault();
      return;
    }
    onCanvasKeyDown?.(event);
  };
  const onDown = (event: MouseEvent) => {
    if (!event.target || (event.target as Node).nodeType !== 1) return;
    const root = editor.getComponents().models[0];
    if (!root) return;
    if (event.button === 1 || modeRef.current === 'hand' || temporaryPanRef.current) {
      state = { kind: 'pan', startX: event.clientX, startY: event.clientY };
      document.body.classList.add('builder-canvas-panning');
      setCanvasInteractionClass(editor, modeRef.current, true);
      event.preventDefault();
      return;
    }
    if (event.button !== 0) return;
    const targetElement = event.target as Element;
    const source = componentForCanvasElement(root, targetElement);
    if (!source || source === root) return;
    editor.select(source);
    state = {
      kind: 'drag',
      source,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    };
    event.preventDefault();
  };

  frameDocument.addEventListener('mousedown', onDown, true);
  frameDocument.addEventListener('mousemove', onMove, true);
  frameDocument.addEventListener('mouseup', onUp, true);
  frameDocument.addEventListener('keydown', handleKeyDown, true);
  return () => {
    frameDocument.removeEventListener('mousedown', onDown, true);
    frameDocument.removeEventListener('mousemove', onMove, true);
    frameDocument.removeEventListener('mouseup', onUp, true);
    frameDocument.removeEventListener('keydown', handleKeyDown, true);
    cleanupState();
  };
}

function isBlockPresetId(value: BuilderInsertable): value is BlockPresetId {
  return (
    typeof value === 'string' &&
    BUILDER_BLOCK_PRESET_REGISTRY.some(
      (candidate) => candidate.kind === 'preset' && candidate.id === value,
    )
  );
}

function isGlobalBuilderPresetId(value: BuilderInsertable): value is GlobalPresetId {
  return typeof value === 'string' && isGlobalPresetId(value);
}

function createInsertableDefinition(type: BuilderInsertable): ComponentDefinition {
  if (isBlockPresetId(type)) return createBlockPresetDefinition(type);
  if (isGlobalBuilderPresetId(type)) return createGlobalPresetDefinition(type);
  return createBlockDefinition(type);
}

function insertableNodeType(
  definition: ComponentDefinition,
): BuilderBlockType | undefined {
  const type = definition.attributes?.[BUILDER_NODE_TYPE_ATTRIBUTE];
  return typeof type === 'string' &&
    isBuilderNodeType(type) &&
    type !== 'root' &&
    type !== 'reusable-instance'
    ? type
    : undefined;
}

function dropDefinitionAtPoint(
  editor: Editor,
  definition: ComponentDefinition,
  clientX: number,
  clientY: number,
  commit: (command: EditorCommand) => EditorCommandResult,
): Component | undefined {
  const frame = editor.Canvas.getFrameEl();
  if (!frame) return undefined;

  const root = editor.getComponents().models[0];
  if (!root) return undefined;
  const childType = insertableNodeType(definition);
  if (!childType) return undefined;
  const rootAcceptsDirectly =
    PAGE_COMPONENT_REGISTRY.root.allowedChildren.includes(childType);
  const canWrapInSection =
    PAGE_COMPONENT_REGISTRY[childType].allowedParents.includes('section');

  const frameRect = frame.getBoundingClientRect();
  const frameDocument = frame.contentDocument;
  if (!frameDocument) return undefined;

  const points = [
    { x: clientX - frameRect.left, y: clientY - frameRect.top },
    { x: clientX, y: clientY },
  ];
  let target: Component | undefined;
  for (const point of points) {
    let candidate: Component | undefined =
      componentForCanvasPoint(root, frameDocument, point.x, point.y) ?? undefined;
    while (candidate) {
      const targetType = candidate.getAttributes({ noStyle: true })[
        BUILDER_NODE_TYPE_ATTRIBUTE
      ];
      if (
        isPayloadNodeType(targetType) &&
        (canInsertIntoComponent(candidate, childType) ||
          (targetType === 'root' && !rootAcceptsDirectly && canWrapInSection))
      ) {
        target = candidate;
        break;
      }
      candidate = candidate.parent() ?? undefined;
    }
    if (target) break;
  }
  if (
    !target &&
    clientX >= frameRect.left &&
    clientX <= frameRect.right &&
    clientY >= frameRect.top &&
    clientY <= frameRect.bottom
  ) {
    target = root;
  }
  if (!target) return undefined;

  // A page that started on an older payload version must be promoted before a
  // global Header/Footer node is persisted. V7 is the first page envelope
  // that explicitly permits copied global nodes.
  if (childType === 'global-header' || childType === 'global-footer') {
    root.addAttributes({ [BUILDER_PAYLOAD_VERSION_ATTRIBUTE]: '7' });
  }

  if (target === root && !rootAcceptsDirectly && canWrapInSection) {
    const sectionResult = commit({
      kind: 'insert',
      definition: createBlockDefinition('section'),
      parentId: payloadNodeId(root),
    });
    if (!sectionResult.changed) return undefined;
    target = sectionResult.selection ?? editor.getSelected() ?? root;
  }
  const result = commit({
    kind: 'insert',
    definition,
    parentId: payloadNodeId(target),
  });
  return result.changed
    ? (result.selection ?? editor.getSelected() ?? undefined)
    : undefined;
}

function findAppendTarget(
  root: Component,
  childType: BuilderBlockType,
): Component | null {
  let target: Component | null = null;
  root.onAll((component) => {
    if (target) {
      return;
    }
    const type = component.getAttributes({ noStyle: true })[BUILDER_NODE_TYPE_ATTRIBUTE];
    if (isPayloadNodeType(type) && canInsertIntoComponent(component, childType)) {
      target = component;
    }
  });
  return target;
}

function applyAllViewportStyles(
  root: Component,
  viewport: BuilderViewport,
  designSystem?: SiteDesignSystem,
): void {
  const components: Component[] = [];
  root.onAll((component) => {
    components.push(component);
    applyEditorViewportStyle(component, viewport, designSystem);
  });
  // Part presentation is a second pass so a parent compound part cannot be
  // overwritten by the ordinary inline style of its projected child. Reverse
  // order also lets a global wrapper part win over a child component root part.
  [...components].reverse().forEach((component) => {
    const type = payloadNodeType(component);
    if (type) applyEditorPartViewportStyles(component, type, viewport, designSystem);
  });
}

type BuiltInBuilderBlockType = Exclude<BuilderBlockType, 'extension'>;

const blockTypes: readonly BuiltInBuilderBlockType[] = [
  ...(Object.keys(PAGE_COMPONENT_REGISTRY).filter(
    (type): type is BuiltInBuilderBlockType =>
      isBuilderNodeType(type) &&
      type !== 'root' &&
      type !== 'extension' &&
      type !== 'reusable-instance' &&
      PAGE_COMPONENT_REGISTRY[type].builder.insertable,
  ) as BuiltInBuilderBlockType[]),
];

function createBlockManagerDefinitions(
  documentKind: BuilderDocumentKind,
): BlockProperties[] {
  return blockTypes
    .filter((type) =>
      PAGE_COMPONENT_REGISTRY[type].builder.documentKinds.includes(documentKind),
    )
    .map((type) => ({
      category: documentKind === 'page' ? 'PagePayloadV1' : documentKind,
      content: () => createBlockDefinition(type),
      id: type,
      label: PAGE_COMPONENT_REGISTRY[type].label,
      resetId: true,
      select: true,
    }));
}

const canvasNodeLabels: Record<BuilderNodeType, string> = {
  root: 'Page',
  section: 'Section',
  container: 'Container',
  text: 'Text',
  image: 'Image',
  button: 'Button',
  form: 'Form',
  countdown: 'Countdown',
  extension: 'Custom extension',
  heading: 'Heading',
  link: 'Link',
  divider: 'Divider',
  list: 'List',
  video: 'Video',
  quote: 'Quote',
  accordion: 'Accordion',
  'accordion-item': 'Accordion Item',
  tabs: 'Tabs',
  'tab-item': 'Tab Item',
  gallery: 'Gallery',
  'global-header': 'Global Header',
  'global-footer': 'Global Footer',
  'navigation-view': 'Navigation',
  'site-brand': 'Site Brand',
  'reusable-instance': 'Linked reusable',
  'collection-list': 'Collection list',
  'collection-item': 'Collection item template',
};

function canvasNodeLabel(component: Component, type: BuilderNodeType): string {
  const content = String(component.get('content') ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if ((type === 'text' || type === 'button') && content) {
    return `${canvasNodeLabels[type]}: ${content.slice(0, 28)}${content.length > 28 ? '…' : ''}`;
  }
  return canvasNodeLabels[type];
}

function canvasNodeDepth(component: Component): number {
  let depth = 0;
  let parent = component.parent();
  while (parent) {
    const parentType = parent.getAttributes({ noStyle: true })[
      BUILDER_NODE_TYPE_ATTRIBUTE
    ];
    if (isPayloadNodeType(parentType)) depth += 1;
    parent = parent.parent();
  }
  return depth;
}

type BuilderCanvasGeometry = Pick<BuilderCanvasState, 'page' | 'nodes'>;

function canvasViewportFromEditor(
  editor: Editor,
  page: BuilderCanvasGeometry['page'],
): BuilderCanvasState['viewport'] {
  const zoom = Math.max(editor.Canvas.getZoom() / 100, 0.01);
  const canvasOffset = editor.Canvas.getCanvasView().getCanvasOffset();
  const frameDocument = editor.Canvas.getFrameEl()?.contentDocument;
  const frameScrollElement = frameDocument?.scrollingElement;
  const frameScrollLeft = frameScrollElement?.scrollLeft ?? 0;
  const frameScrollTop = frameScrollElement?.scrollTop ?? 0;
  const canvasScroll = editor.Canvas.getCanvasView().getCanvasScroll();
  const viewportX = frameScrollLeft + canvasScroll.scrollLeft / zoom;
  const viewportY = frameScrollTop + canvasScroll.scrollTop / zoom;

  return {
    x: Math.min(Math.max(viewportX, 0), page.width),
    y: Math.min(Math.max(viewportY, 0), page.height),
    width: Math.min(page.width, Math.max(canvasOffset.width / zoom, 1)),
    height: Math.min(page.height, Math.max(canvasOffset.height / zoom, 1)),
  };
}

function canvasStateFromEditor(editor: Editor): BuilderCanvasState {
  const root = getEditorRoot(editor);
  const nodes: BuilderCanvasNode[] = [];

  root.onAll((component) => {
    if (isEditorOnlyPreview(component)) return;
    const attributes = component.getAttributes({ noStyle: true });
    const type = attributes[BUILDER_NODE_TYPE_ATTRIBUTE];
    const id = attributes[BUILDER_NODE_ID_ATTRIBUTE];
    if (!isPayloadNodeType(type) || typeof id !== 'string') return;

    const element = component.getEl();
    if (!element) return;

    try {
      const position = editor.Canvas.getElementPos(element, {
        avoidFrameOffset: true,
        avoidFrameZoom: true,
      });
      const parent = component.parent();
      const parentId = parent?.getAttributes({ noStyle: true })[
        BUILDER_NODE_ID_ATTRIBUTE
      ];
      nodes.push({
        id,
        type,
        label: canvasNodeLabel(component, type),
        ...(typeof parentId === 'string' ? { parentId } : {}),
        depth: canvasNodeDepth(component),
        x: position.left,
        y: position.top,
        width: Math.max(position.width, 0),
        height: Math.max(position.height, 0),
      });
    } catch {
      // GrapesJS can briefly expose a component before its iframe element is laid out.
    }
  });

  const rootNode = nodes.find((node) => node.type === 'root');
  const right = Math.max(...nodes.map((node) => node.x + node.width), 1);
  const bottom = Math.max(...nodes.map((node) => node.y + node.height), 1);
  const pageWidth = Math.max(rootNode?.width ?? 0, right, 1);
  const pageHeight = Math.max(rootNode?.height ?? 0, bottom, 1);
  const page = { width: pageWidth, height: pageHeight };

  return {
    page,
    viewport: canvasViewportFromEditor(editor, page),
    zoom: editor.Canvas.getZoom(),
    nodes,
  };
}

function getEditorRoot(editor: Editor): Component {
  const root = editor.getComponents().models[0];
  if (!root) {
    throw new Error('Builder editor root is missing');
  }
  return root;
}

function findComponentById(root: Component, id: string): Component | undefined {
  return findPayloadComponent(root, id);
}

function scrollCanvasToPoint(editor: Editor, x: number, y: number): void {
  const frame = editor.Canvas.getFrameEl();
  const frameDocument = frame?.contentDocument;
  const zoom = Math.max(editor.Canvas.getZoom() / 100, 0.01);
  const left = Math.max(0, x) * zoom;
  const top = Math.max(0, y) * zoom;
  const canvasElement = editor.Canvas.getCanvasView().el;
  const canvasCanScroll =
    canvasElement.scrollHeight > canvasElement.clientHeight + 1 ||
    canvasElement.scrollWidth > canvasElement.clientWidth + 1;

  if (canvasCanScroll) {
    canvasElement.scrollTo({ left, top, behavior: 'smooth' });
    return;
  }

  frameDocument?.defaultView?.scrollTo({ left, top, behavior: 'smooth' });
}

export const GrapesEditor = forwardRef(function GrapesEditor(
  {
    documentKind,
    pageId,
    initialPayload,
    initialComposition,
    reusableRuntime = [],
    designSystem,
    siteName,
    siteLogo,
    navigation,
    onDirty,
    onDocumentChange,
    onSelectionChange,
    onReady,
    onHistoryChange,
    onCanvasStateChange,
    onInteractionModeChange,
    onError,
    onValidationIssue,
    validationIssues = [],
  }: GrapesEditorProps,
  ref: Ref<GrapesEditorHandle>,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const commandBusRef = useRef<ReturnType<typeof createEditorCommandBus> | null>(null);
  const blockDragCleanupRef = useRef<(() => void) | null>(null);
  // Selection identity is the stable PagePayload node id. Component instances
  // are resolved from the live GrapesJS tree and are never persisted in React.
  const selectionRef = useRef(new BuilderSelection());
  const pendingProgrammaticSelectionRef = useRef<string | null>(null);
  const viewportRef = useRef<BuilderViewport>('desktop');
  const internalChangeRef = useRef(false);
  const initializationSettlingRef = useRef(true);
  const initialPersistedSignatureRef = useRef<string | null>(null);
  const selectingComponentRef = useRef(false);
  const canvasStateFrameRef = useRef<number | null>(null);
  const canvasGeometryRef = useRef<BuilderCanvasGeometry | null>(null);
  const canvasGeometryPendingRef = useRef(true);
  const callbacksRef = useRef({
    onDirty,
    onDocumentChange,
    onSelectionChange,
    onReady,
    onHistoryChange,
    onCanvasStateChange,
    onInteractionModeChange,
    onError,
    onValidationIssue,
  });
  const validationIssuesRef = useRef(validationIssues);
  const payloadRef = useRef(initialPayload);
  const compositionRef = useRef<PageCompositionFields | undefined>(initialComposition);
  const reusableRuntimeRef = useRef(reusableRuntime);
  const designSystemRef = useRef(designSystem);
  const projectionContextRef = useRef<{
    siteName?: string;
    siteLogo?: string;
    navigation?: {
      main?: readonly ResolvedNavigationItem[];
      footer?: readonly ResolvedNavigationItem[];
    };
  }>({});
  const interactionModeRef = useRef<InteractionMode>('select');
  const temporaryPanRef = useRef(false);

  callbacksRef.current = {
    onDirty,
    onDocumentChange,
    onSelectionChange,
    onReady,
    onHistoryChange,
    onCanvasStateChange,
    onInteractionModeChange,
    onError,
    onValidationIssue,
  };
  validationIssuesRef.current = validationIssues;
  payloadRef.current = initialPayload;
  reusableRuntimeRef.current = reusableRuntime;
  designSystemRef.current = designSystem;
  projectionContextRef.current = {
    ...(siteName !== undefined ? { siteName } : {}),
    ...(siteLogo !== undefined ? { siteLogo } : {}),
    ...(navigation !== undefined ? { navigation } : {}),
  };

  function getRoot(editor: Editor): Component {
    const root = editor.getComponents().models[0];
    if (!root) {
      throw new Error('Builder editor root is missing');
    }
    return root;
  }

  function refreshClonedComponentIdentity(editor: Editor, clone: Component): void {
    const safeClone = remapSubtreeNodeIds(
      snapshotFromGrapesComponent(clone),
      collectPersistedNodeIds(snapshotFromGrapesComponent(getRoot(editor))),
    );

    const apply = (
      component: Component,
      snapshot: ReturnType<typeof snapshotFromGrapesComponent>,
    ): void => {
      component.setAttributes(snapshot.attributes);
      snapshot.children.forEach((childSnapshot, index) => {
        const child = component.components().models[index];
        if (child) apply(child, childSnapshot);
      });
    };

    apply(clone, safeClone);
  }

  function notifySelection(editor: Editor): void {
    // React-facing selection is keyed by the persisted PagePayload ID. Prefer
    // that live component when GrapesJS briefly reports a stale selection
    // during canvas/layout updates (notably for unloaded media).
    let selected: Component | undefined;
    try {
      const root = editor.getComponents().models[0];
      selected =
        (root ? selectionRef.current.resolve(root) : undefined) ?? editor.getSelected();
    } catch {
      // GrapesJS can emit a final model event after its modules have started
      // teardown. There is no selection to publish in that lifecycle window.
      return;
    }
    if (!selected) {
      if (internalChangeRef.current) return;
      selectionRef.current.clear();
      callbacksRef.current.onSelectionChange(null);
      return;
    }
    selectionRef.current.set(selected);
    callbacksRef.current.onSelectionChange(selectionFromComponent(selected));
  }

  function getSelectedComponent(editor: Editor): Component | undefined {
    const root = editor.getComponents().models[0];
    const canonical = root ? selectionRef.current.resolve(root) : undefined;
    if (canonical) return canonical;
    const selected = editor.getSelected();
    if (selected) {
      selectionRef.current.set(selected);
      return selected;
    }
    return selectionRef.current.resolve(getRoot(editor));
  }

  /** Commit GrapesJS' active RTE before an Inspector mutation. */
  function finishInlineEdit(editor: Editor): void {
    const editing = editor.getEditing();
    if (editing) editing.trigger('disable');
  }

  function mutateAfterInlineEdit(editor: Editor, mutation: () => void): void {
    if (!editor.getEditing()) {
      mutation();
      return;
    }
    finishInlineEdit(editor);
    // RTE disable is async in GrapesJS because it reads the iframe DOM before
    // syncing model content. Run the Inspector command after that lifecycle has
    // completed so the old DOM value cannot overwrite the new command value.
    window.setTimeout(mutation, 0);
  }

  function notifyHistory(editor: Editor): void {
    callbacksRef.current.onHistoryChange({
      canRedo: editor.UndoManager.hasRedo(),
      canUndo: editor.UndoManager.hasUndo(),
    });
  }

  function createDocumentSnapshot(editor: Editor): PageDocument | SiteGlobalPayloadV1 {
    const root = getRoot(editor);
    if (documentKind === 'page') {
      const payload = serializeGrapesComponent(root, 'page') as PagePayload;
      if (!pageId) return createPageDocument(payload);
      const composition = compositionFieldsFromPayload(
        payload,
        pageId,
        compositionRef.current,
      );
      compositionRef.current = composition;
      return createPageDocument(payload, composition);
    }
    return serializeGrapesComponent(root, documentKind) as SiteGlobalPayloadV1;
  }

  function notifyDocumentChange(editor: Editor): void {
    try {
      callbacksRef.current.onDocumentChange(createDocumentSnapshot(editor));
    } catch {
      // The editor may be between teardown and the final mutation event.
    }
  }

  function emitCanvasState(editor: Editor, includeGeometry: boolean): void {
    try {
      if (includeGeometry || !canvasGeometryRef.current) {
        const nextState = canvasStateFromEditor(editor);
        canvasGeometryRef.current = {
          page: nextState.page,
          nodes: nextState.nodes,
        };
        callbacksRef.current.onCanvasStateChange(nextState);
        return;
      }
      const geometry = canvasGeometryRef.current;
      callbacksRef.current.onCanvasStateChange({
        ...geometry,
        viewport: canvasViewportFromEditor(editor, geometry.page),
        zoom: editor.Canvas.getZoom(),
      });
    } catch {
      // The editor can be torn down while a queued frame is still running.
    }
  }

  function scheduleCanvasState(editor: Editor, includeGeometry = false): void {
    if (includeGeometry) canvasGeometryPendingRef.current = true;
    if (canvasStateFrameRef.current !== null) return;
    canvasStateFrameRef.current = window.requestAnimationFrame(() => {
      canvasStateFrameRef.current = null;
      if (editorRef.current === editor) {
        const includeNextGeometry = canvasGeometryPendingRef.current;
        canvasGeometryPendingRef.current = false;
        emitCanvasState(editor, includeNextGeometry);
      }
    });
  }

  function commitStructuralMove(editor: Editor, intent: MoveNodeIntent): boolean {
    return commitEditorCommand(editor, { kind: 'move', intent });
  }

  function commitEditorCommandResult(
    editor: Editor,
    command: EditorCommand,
  ): EditorCommandResult {
    // GrapesJS emits component events for the same mutation. Suppress those
    // observer-side dirty notifications while the command is committing so a
    // user action creates one coherent document/dirty update.
    const wasInternalChange = internalChangeRef.current;
    internalChangeRef.current = true;
    let result: EditorCommandResult;
    try {
      result =
        commandBusRef.current?.dispatch(command) ?? executeEditorCommand(editor, command);
    } catch (caughtError) {
      const expectedInputError =
        command.kind === 'set-property' ||
        command.kind === 'set-responsive-style' ||
        command.kind === 'set-part-responsive-style';
      if (expectedInputError || caughtError instanceof BuilderAdapterError) {
        callbacksRef.current.onValidationIssue?.(
          validationIssueFromError(caughtError, {
            scope: scopeForDocumentKind(documentKind),
            ...('nodeId' in command && command.nodeId ? { nodeId: command.nodeId } : {}),
            tab:
              command.kind === 'set-responsive-style' ||
              command.kind === 'set-part-responsive-style'
                ? 'style'
                : 'content',
            section:
              command.kind === 'set-part-responsive-style'
                ? 'component-part'
                : command.kind === 'set-responsive-style'
                  ? 'effects'
                  : 'content',
            ...('property' in command && command.property
              ? { field: command.property }
              : {}),
            ...('partName' in command && command.partName
              ? { partName: command.partName }
              : {}),
            viewport: viewportRef.current,
          }),
        );
      } else {
        callbacksRef.current.onError(
          caughtError instanceof Error ? caughtError.message : 'Editor command failed',
        );
      }
      result = { changed: false };
    }
    queueMicrotask(() => {
      internalChangeRef.current = wasInternalChange;
    });
    if (!result.changed) return result;
    if (result.selection) {
      const expectedSelectionId = payloadNodeId(result.selection) ?? '';
      pendingProgrammaticSelectionRef.current = expectedSelectionId;
      selectionRef.current.select(editor, result.selection);
      window.setTimeout(() => {
        if (
          editorRef.current !== editor ||
          pendingProgrammaticSelectionRef.current !== expectedSelectionId
        ) {
          return;
        }
        if (editor.getSelected() !== result.selection) {
          selectingComponentRef.current = true;
          selectionRef.current.select(editor, result.selection);
          selectingComponentRef.current = false;
        }
        notifySelection(editor);
        window.setTimeout(() => {
          if (
            editorRef.current === editor &&
            pendingProgrammaticSelectionRef.current === expectedSelectionId
          ) {
            pendingProgrammaticSelectionRef.current = null;
          }
        }, 500);
      }, 0);
      if (command.kind === 'remove') {
        // GrapesJS may emit its deselection event after the command returns.
        // Restore the command's deterministic parent selection on the next
        // turn without keeping a component reference in React state.
        window.setTimeout(() => {
          if (editorRef.current !== editor || editor.getSelected()) return;
          const fallback = selectionRef.current.resolve(getRoot(editor));
          if (fallback) {
            selectionRef.current.select(editor, fallback);
            notifySelection(editor);
          }
        }, 0);
      }
    }
    callbacksRef.current.onDirty();
    notifySelection(editor);
    notifyHistory(editor);
    notifyDocumentChange(editor);
    scheduleCanvasState(editor, true);
    return result;
  }

  function commitEditorCommand(editor: Editor, command: EditorCommand): boolean {
    return commitEditorCommandResult(editor, command).changed;
  }

  function commitSelectedProperty(
    editor: Editor,
    property: string,
    value: unknown,
  ): void {
    mutateAfterInlineEdit(editor, () => {
      const selected = getSelectedComponent(editor);
      if (!selected) return;
      const type = selected.getAttributes({ noStyle: true })[BUILDER_NODE_TYPE_ATTRIBUTE];
      if (!isBuilderNodeType(type)) return;
      const command = createEditorPropertyCommand(
        payloadNodeId(selected) ?? '',
        type,
        property,
        value,
      );
      if (command) commitEditorCommand(editor, command);
    });
  }

  useImperativeHandle(ref, () => {
    const serializeDocument = (): PageDocument | SiteGlobalPayloadV1 => {
      const editor = editorRef.current;
      if (!editor) {
        throw new Error('Builder editor is not ready');
      }
      return createDocumentSnapshot(editor);
    };

    const applyGlobalPreset = (
      editor: Editor,
      definition: ComponentDefinition,
    ): boolean => {
      const root = getRoot(editor);
      if (!root) return false;
      const globalType = insertableNodeType(definition);
      if (globalType !== 'global-header' && globalType !== 'global-footer') return false;
      const existing = root
        .components()
        .models.filter((child) => payloadNodeType(child) === globalType);
      if (existing.length !== 1) return false;
      const target = existing[0];
      if (!target) return false;
      if (
        target.components().models.length > 0 &&
        !window.confirm(
          'This global region already has content. Replace it with this preset?',
        )
      ) {
        return false;
      }
      const result = commitEditorCommandResult(editor, {
        kind: 'apply-global-preset',
        nodeId: payloadNodeId(target) ?? '',
        definition,
      });
      if (result.selection) selectionRef.current.select(editor, result.selection);
      return result.changed;
    };

    const startDefinitionDrag = (definition: ComponentDefinition, event: Event): void => {
      const editor = editorRef.current;
      if (!editor) return;
      const mouseEvent = event as MouseEvent;
      if (mouseEvent.button !== 0) return;

      const frameDocument = editor.Canvas.getFrameEl()?.contentDocument;
      blockDragCleanupRef.current?.();
      const state = {
        startX: mouseEvent.clientX,
        startY: mouseEvent.clientY,
        dragging: false,
      };
      const cleanup = () => {
        window.removeEventListener('mousemove', handleMove, true);
        window.removeEventListener('mouseup', handleUp, true);
        frameDocument?.removeEventListener('mousemove', handleFrameMove, true);
        frameDocument?.removeEventListener('mouseup', handleFrameUp, true);
        document.body.classList.remove('builder-block-dragging');
        if (blockDragCleanupRef.current === cleanup) {
          blockDragCleanupRef.current = null;
        }
      };
      const handleMove = (moveEvent: MouseEvent) => {
        const distance = Math.hypot(
          moveEvent.clientX - state.startX,
          moveEvent.clientY - state.startY,
        );
        if (!state.dragging && distance < 4) return;
        state.dragging = true;
        document.body.classList.add('builder-block-dragging');
        moveEvent.preventDefault();
      };
      const handleUp = (
        upEvent: MouseEvent,
        clientX = upEvent.clientX,
        clientY = upEvent.clientY,
      ) => {
        cleanup();
        if (!state.dragging) return;
        dropDefinitionAtPoint(editor, definition, clientX, clientY, (command) =>
          commitEditorCommandResult(editor, command),
        );
      };
      const handleFrameMove = (moveEvent: MouseEvent) => handleMove(moveEvent);
      const handleFrameUp = (upEvent: MouseEvent) => {
        const frameRect = editor.Canvas.getFrameEl()?.getBoundingClientRect();
        handleUp(
          upEvent,
          (frameRect?.left ?? 0) + upEvent.clientX,
          (frameRect?.top ?? 0) + upEvent.clientY,
        );
      };

      blockDragCleanupRef.current = cleanup;
      window.addEventListener('mousemove', handleMove, true);
      window.addEventListener('mouseup', handleUp, true);
      frameDocument?.addEventListener('mousemove', handleFrameMove, true);
      frameDocument?.addEventListener('mouseup', handleFrameUp, true);
      mouseEvent.preventDefault();
      mouseEvent.stopPropagation();
    };

    return {
      addBlock(type) {
        const editor = editorRef.current;
        if (!editor) return;
        const definition = createInsertableDefinition(type);
        const childType = insertableNodeType(definition);
        if (!childType) return;
        if (documentKind !== 'page' && isGlobalBuilderPresetId(type)) {
          applyGlobalPreset(editor, definition);
          return;
        }
        const selected = editor.getSelected();
        const selectedType = selected?.getAttributes({ noStyle: true })[
          BUILDER_NODE_TYPE_ATTRIBUTE
        ];
        const target =
          selected &&
          isPayloadNodeType(selectedType) &&
          canInsertIntoComponent(selected, childType)
            ? selected
            : findAppendTarget(getRoot(editor), childType);

        let parent: Component | undefined = target ?? undefined;
        if (!parent && (childType === 'section' || childType === 'container')) {
          parent = getRoot(editor);
        } else if (!parent) {
          // Wrapper creation and the first child are one authored compound
          // insertion, so Undo removes the complete subtree in one step.
          const sectionDefinition = createBlockDefinition('section');
          sectionDefinition.components = [definition];
          const sectionResult = commitEditorCommandResult(editor, {
            kind: 'insert',
            definition: sectionDefinition,
          });
          const child = sectionResult.selection?.components().models[0];
          if (child) {
            pendingProgrammaticSelectionRef.current = payloadNodeId(child) ?? null;
            selectingComponentRef.current = true;
            selectionRef.current.select(editor, child);
            selectingComponentRef.current = false;
            if (childType === 'form') ensureFormPreview(child);
          }
          return;
        }
        if (!parent) return;
        const result = commitEditorCommand(editor, {
          kind: 'insert',
          definition,
          parentId: payloadNodeId(parent),
        });
        const added = result ? getSelectedComponent(editor) : undefined;
        if (added) {
          if (childType === 'form') ensureFormPreview(added);
          selectingComponentRef.current = true;
          selectionRef.current.select(editor, added);
          selectingComponentRef.current = false;
        }
      },
      addExtensionBlock(extensionId) {
        const editor = editorRef.current;
        if (!editor) return;
        const definition = createExtensionBlockDefinition(extensionId);
        const selected = editor.getSelected();
        const selectedType = selected?.getAttributes({ noStyle: true })[
          BUILDER_NODE_TYPE_ATTRIBUTE
        ];
        const target =
          selected &&
          isPayloadNodeType(selectedType) &&
          canInsertIntoComponent(selected, 'extension')
            ? selected
            : findAppendTarget(getRoot(editor), 'extension');
        let parent: Component | undefined = target ?? undefined;
        if (!parent) {
          const sectionResult = commitEditorCommand(editor, {
            kind: 'insert',
            definition: createBlockDefinition('section'),
          });
          parent = sectionResult ? getSelectedComponent(editor) : undefined;
        }
        if (!parent) return;
        const result = commitEditorCommand(editor, {
          kind: 'insert',
          definition,
          parentId: payloadNodeId(parent),
        });
        if (result) {
          const added = getSelectedComponent(editor);
          if (added) selectionRef.current.select(editor, added);
        }
      },
      addLayoutExtension(document) {
        const editor = editorRef.current;
        if (!editor || documentKind !== 'page') return;
        const definition = siteGlobalDocumentToEditorDefinition(document, {
          ...(designSystemRef.current ? { designSystem: designSystemRef.current } : {}),
          projectionContext: projectionContextRef.current,
        });
        const childType = insertableNodeType(definition);
        if (childType !== 'global-header' && childType !== 'global-footer') return;
        getRoot(editor).addAttributes({ [BUILDER_PAYLOAD_VERSION_ATTRIBUTE]: '7' });
        const selected = editor.getSelected();
        const selectedType = selected?.getAttributes({ noStyle: true })[
          BUILDER_NODE_TYPE_ATTRIBUTE
        ];
        const target =
          selected &&
          isPayloadNodeType(selectedType) &&
          canInsertIntoComponent(selected, childType)
            ? selected
            : getRoot(editor);
        const result = commitEditorCommandResult(editor, {
          kind: 'insert',
          definition,
          parentId: payloadNodeId(target),
        });
        if (result.selection) selectionRef.current.select(editor, result.selection);
      },
      startBlockDrag(type, event) {
        startDefinitionDrag(createInsertableDefinition(type), event);
      },
      startLayoutExtensionDrag(document, event) {
        if (documentKind !== 'page') return;
        startDefinitionDrag(
          siteGlobalDocumentToEditorDefinition(document, {
            ...(designSystemRef.current ? { designSystem: designSystemRef.current } : {}),
            projectionContext: projectionContextRef.current,
          }),
          event,
        );
      },
      duplicateSelected() {
        const editor = editorRef.current;
        const selected = editor ? getSelectedComponent(editor) : undefined;
        if (!editor || !selected || selected === getRoot(editor)) return;
        commitEditorCommand(editor, {
          kind: 'duplicate',
          nodeId: payloadNodeId(selected) ?? '',
        });
      },
      deleteSelected() {
        const editor = editorRef.current;
        const selected = editor ? getSelectedComponent(editor) : undefined;
        if (!editor || !selected || selected === getRoot(editor)) return;
        commitEditorCommand(editor, {
          kind: 'remove',
          nodeId: payloadNodeId(selected) ?? '',
        });
      },
      undo() {
        const editor = editorRef.current;
        if (!editor || !editor.UndoManager.hasUndo()) return;
        commitEditorCommand(editor, { kind: 'undo' });
      },
      redo() {
        const editor = editorRef.current;
        if (!editor || !editor.UndoManager.hasRedo()) return;
        commitEditorCommand(editor, { kind: 'redo' });
      },
      getDocument() {
        return serializeDocument();
      },
      updateSelectedForm(form) {
        const editor = editorRef.current;
        if (!editor) return;
        mutateAfterInlineEdit(editor, () => {
          const selected = getSelectedComponent(editor);
          if (!selected) return;
          const type = selected.getAttributes({ noStyle: true })[
            BUILDER_NODE_TYPE_ATTRIBUTE
          ];
          if (type !== 'form') return;
          commitEditorCommand(editor, {
            kind: 'update-props',
            nodeId: payloadNodeId(selected) ?? '',
            attributes: { [BUILDER_FORM_PROPS_ATTRIBUTE]: JSON.stringify(form) },
            components: formPreviewComponents(form),
          });
        });
      },
      updateSelectedCountdown(props) {
        const editor = editorRef.current;
        if (!editor) return;
        mutateAfterInlineEdit(editor, () => {
          const selected = getSelectedComponent(editor);
          if (!selected) return;
          const type = selected.getAttributes({ noStyle: true })[
            BUILDER_NODE_TYPE_ATTRIBUTE
          ];
          if (type !== 'countdown') return;
          const parsed = CountdownPropsSchema.safeParse(props);
          if (!parsed.success) return;
          let currentPropsInput: unknown;
          try {
            currentPropsInput = JSON.parse(
              String(
                selected.getAttributes({ noStyle: true })[
                  BUILDER_COUNTDOWN_PROPS_ATTRIBUTE
                ] ?? '{}',
              ),
            ) as unknown;
          } catch {
            currentPropsInput = undefined;
          }
          const currentProps = CountdownPropsSchema.safeParse(currentPropsInput);
          const nextProps = currentProps.success
            ? {
                ...parsed.data,
                ...(currentProps.data.attachmentId
                  ? { attachmentId: currentProps.data.attachmentId }
                  : {}),
              }
            : parsed.data;
          commitEditorCommand(editor, {
            kind: 'update-props',
            nodeId: payloadNodeId(selected) ?? '',
            components: countdownPreviewComponents(nextProps),
            attributes: {
              [BUILDER_COUNTDOWN_PROPS_ATTRIBUTE]: JSON.stringify(nextProps),
            },
          });
        });
      },
      serialize() {
        const document = serializeDocument();
        return 'schemaVersion' in document ? document.payload : document;
      },
      acknowledgeSaved(payload, composition) {
        const savedDocument =
          documentKind === 'page' && pageId
            ? createPageDocument(
                payload as PagePayload,
                composition ??
                  compositionFieldsFromPayload(
                    payload as PagePayload,
                    pageId,
                    compositionRef.current,
                  ),
              )
            : payload;
        const savedSignature = pageDocumentSignature(savedDocument);
        if (documentKind === 'page' && composition) {
          try {
            // A save response may race with a newer local edit. Only advance
            // the working composition when the live editor is still exactly
            // the document that was acknowledged by the server.
            if (pageDocumentSignature(serializeDocument()) === savedSignature) {
              compositionRef.current = composition;
            }
          } catch {
            // The editor can be tearing down during navigation; retain the
            // current working composition in that case.
          }
        }
        initialPersistedSignatureRef.current = savedSignature;
      },
      setWorkingComposition(composition) {
        if (documentKind === 'page') compositionRef.current = composition;
      },
      setViewport(viewport) {
        const editor = editorRef.current;
        if (!editor || viewport === viewportRef.current) return;
        const root = getRoot(editor);
        const selected = getSelectedComponent(editor);
        const selectedSnapshot = selectionFromComponent(selected);
        const wasInternalChange = internalChangeRef.current;
        internalChangeRef.current = true;
        try {
          // Viewport selection is editor UI state. Authored responsive deltas
          // are already stored by the style command, so changing viewport must
          // not capture or create a PagePayload mutation of its own.
          editor.setDevice(viewport);
          const frameElement = editor.Canvas.getFrameEl();
          if (frameElement) {
            frameElement.style.setProperty(
              'width',
              PAGE_RESPONSIVE_BREAKPOINTS[viewport].canvasWidth || '100%',
              'important',
            );
            frameElement.style.setProperty('min-width', '0', 'important');
            frameElement.style.setProperty(
              'max-width',
              PAGE_RESPONSIVE_BREAKPOINTS[viewport].canvasWidth || 'none',
              'important',
            );
            frameElement.parentElement?.style.setProperty(
              'width',
              PAGE_RESPONSIVE_BREAKPOINTS[viewport].canvasWidth || '100%',
              'important',
            );
          }
          editor
            .getModel()
            .skip(() => applyAllViewportStyles(root, viewport, designSystem));
        } finally {
          // GrapesJS model events are synchronous for these presentation
          // updates. Restore the previous command state immediately so a user
          // edit after a viewport click cannot be mistaken for presentation.
          internalChangeRef.current = wasInternalChange;
        }
        viewportRef.current = viewport;
        callbacksRef.current.onSelectionChange(selectedSnapshot);
        const selectedId = selected ? payloadNodeId(selected) : undefined;
        const restoreSelection = () => {
          // Viewport reflow can emit a delayed canvas:update. Do not restore
          // the selection captured before the viewport switch after the user
          // has selected another node through Layers, Minimap, or Canvas.
          if (
            selected &&
            editorRef.current === editor &&
            selectedId === selectionRef.current.id
          ) {
            selectionRef.current.select(editor, selected);
            notifySelection(editor);
          }
        };
        editor.once('canvas:update', restoreSelection);
        window.setTimeout(() => {
          restoreSelection();
        }, 500);
      },
      updateSelectedText(value) {
        const editor = editorRef.current;
        if (!editor) return;
        const type = getSelectedComponent(editor)?.getAttributes({ noStyle: true })[
          BUILDER_NODE_TYPE_ATTRIBUTE
        ];
        const property = type === 'button' ? 'label' : 'text';
        commitSelectedProperty(editor, property, value);
      },
      updateSelectedProperty(property, value) {
        const editor = editorRef.current;
        if (!editor) return;
        commitSelectedProperty(editor, property, value);
      },
      updateSelectedAttribute(name, value) {
        const editor = editorRef.current;
        if (!editor) return;
        commitSelectedProperty(editor, name, value);
      },
      updateSelectedStyle(property, value) {
        const editor = editorRef.current;
        if (!editor) return;
        mutateAfterInlineEdit(editor, () => {
          const selected = getSelectedComponent(editor);
          if (!selected) return;
          internalChangeRef.current = true;
          commitEditorCommand(editor, {
            kind: 'set-responsive-style',
            nodeId: payloadNodeId(selected) ?? '',
            property,
            value,
            viewport: viewportRef.current,
          });
          queueMicrotask(() => {
            internalChangeRef.current = false;
          });
        });
      },
      resetSelectedStyle(property) {
        const editor = editorRef.current;
        if (!editor) return;
        mutateAfterInlineEdit(editor, () => {
          const selected = getSelectedComponent(editor);
          if (!selected) return;
          internalChangeRef.current = true;
          commitEditorCommand(editor, {
            kind: 'set-responsive-style',
            nodeId: payloadNodeId(selected) ?? '',
            property,
            value: '',
            viewport: viewportRef.current,
          });
          queueMicrotask(() => {
            internalChangeRef.current = false;
          });
        });
      },
      updateSelectedPartStyle(partName, property, value) {
        const editor = editorRef.current;
        if (!editor) return;
        mutateAfterInlineEdit(editor, () => {
          const selected = getSelectedComponent(editor);
          const type = selected && payloadNodeType(selected);
          if (!selected || !type) return;
          internalChangeRef.current = true;
          commitEditorCommand(editor, {
            kind: 'set-part-responsive-style',
            nodeId: payloadNodeId(selected) ?? '',
            partName,
            property,
            value,
            viewport: viewportRef.current,
          });
          queueMicrotask(() => {
            internalChangeRef.current = false;
          });
        });
      },
      resetSelectedPartStyle(partName, property) {
        const editor = editorRef.current;
        if (!editor) return;
        mutateAfterInlineEdit(editor, () => {
          const selected = getSelectedComponent(editor);
          const type = selected && payloadNodeType(selected);
          if (!selected || !type) return;
          internalChangeRef.current = true;
          commitEditorCommand(editor, {
            kind: 'set-part-responsive-style',
            nodeId: payloadNodeId(selected) ?? '',
            partName,
            property,
            value: '',
            viewport: viewportRef.current,
          });
          queueMicrotask(() => {
            internalChangeRef.current = false;
          });
        });
      },
      selectAsset(src) {
        const editor = editorRef.current;
        if (!editor) return;
        mutateAfterInlineEdit(editor, () => {
          const selected = getSelectedComponent(editor);
          if (!selected) return;
          commitEditorCommand(editor, {
            kind: 'set-attributes',
            nodeId: payloadNodeId(selected) ?? '',
            attributes: { src },
          });
        });
      },
      selectNode(id) {
        const editor = editorRef.current;
        if (!editor) return;
        const component = findComponentById(getRoot(editor), id);
        if (!component) {
          // Layers can render one animation frame ahead of GrapesJS after an
          // insertion or viewport change. Retry by stable payload ID instead
          // of dropping a user selection during that transient window.
          window.setTimeout(() => {
            if (editorRef.current !== editor) return;
            const retry = findComponentById(getRoot(editor), id);
            if (retry) {
              selectionRef.current.select(editor, retry);
              notifySelection(editor);
              scheduleCanvasState(editor);
            }
          }, 0);
          return;
        }
        pendingProgrammaticSelectionRef.current = id;
        selectingComponentRef.current = true;
        selectionRef.current.select(editor, component);
        selectingComponentRef.current = false;
        // Navigator selection must also work for unloaded media and other
        // components whose iframe element has not received layout yet.
        if (component.getEl()) {
          try {
            editor.Canvas.scrollTo(component, {
              behavior: 'auto',
              block: 'center',
            });
          } catch {
            // Selection itself is still valid when canvas scrolling cannot be
            // calculated for an unlaid-out component.
          }
        }
        notifySelection(editor);
        const settleSelection = (attempt: number) => {
          if (
            editorRef.current !== editor ||
            pendingProgrammaticSelectionRef.current !== id
          ) {
            return;
          }
          if (editor.getSelected() !== component) {
            selectingComponentRef.current = true;
            selectionRef.current.select(editor, component);
            selectingComponentRef.current = false;
          }
          notifySelection(editor);
          if (editor.getSelected() === component || attempt >= 5) {
            // GrapesJS may emit a queued deselect/select pair from the prior
            // canvas selection after this callback. Keep the requested ID
            // guarded briefly so that stale events cannot replace a valid
            // Layers/Minimap selection in React.
            window.setTimeout(() => {
              if (
                editorRef.current === editor &&
                pendingProgrammaticSelectionRef.current === id
              ) {
                pendingProgrammaticSelectionRef.current = null;
              }
            }, 500);
            return;
          }
          const delays = [0, 16, 64, 150, 300];
          window.setTimeout(() => settleSelection(attempt + 1), delays[attempt]);
        };
        window.setTimeout(() => settleSelection(0), 0);
        scheduleCanvasState(editor);
      },
      selectParent() {
        const editor = editorRef.current;
        if (!editor) return;
        const selected = getSelectedComponent(editor);
        const parent = selected?.parent();
        const payloadParent = payloadAncestor(parent);
        if (payloadParent) {
          selectionRef.current.select(editor, payloadParent);
          notifySelection(editor);
          scheduleCanvasState(editor);
        }
      },
      insertBlock(type, placement) {
        const editor = editorRef.current;
        if (!editor) return false;
        const definition = createInsertableDefinition(type);
        const childType = insertableNodeType(definition);
        if (!childType) return false;
        if (documentKind !== 'page' && isGlobalBuilderPresetId(type)) {
          return applyGlobalPreset(editor, definition);
        }
        if (placement) {
          if (placement.position === 'inside') {
            const target = findPayloadComponent(getRoot(editor), placement.targetNodeId);
            const targetType = target && payloadNodeType(target);
            if (
              targetType === 'root' &&
              (!target || !canInsertIntoComponent(target, childType))
            ) {
              const sectionDefinition = createBlockDefinition('section');
              sectionDefinition.components = [definition];
              const result = commitEditorCommandResult(editor, {
                kind: 'insert',
                definition: sectionDefinition,
              });
              const child = result.selection?.components().models[0];
              if (!child) return false;
              pendingProgrammaticSelectionRef.current = payloadNodeId(child) ?? null;
              selectionRef.current.select(editor, child);
              notifySelection(editor);
              return true;
            }
          }
          return commitEditorCommand(
            editor,
            placement.position === 'inside'
              ? { kind: 'insert', definition, parentId: placement.targetNodeId }
              : {
                  kind: 'insert',
                  definition,
                  targetId: placement.targetNodeId,
                  position: placement.position,
                },
          );
        }
        const selected = getSelectedComponent(editor);
        const selectedType = selected?.getAttributes({ noStyle: true })[
          BUILDER_NODE_TYPE_ATTRIBUTE
        ];
        const target =
          selected &&
          isPayloadNodeType(selectedType) &&
          canInsertIntoComponent(selected, childType)
            ? selected
            : findAppendTarget(getRoot(editor), childType);
        let parent: Component | undefined = target ?? undefined;
        if (!parent && (childType === 'section' || childType === 'container'))
          parent = getRoot(editor);
        if (!parent) {
          const sectionDefinition = createBlockDefinition('section');
          sectionDefinition.components = [definition];
          const result = commitEditorCommandResult(editor, {
            kind: 'insert',
            definition: sectionDefinition,
          });
          const child = result.selection?.components().models[0];
          if (!child) return false;
          pendingProgrammaticSelectionRef.current = payloadNodeId(child) ?? null;
          selectionRef.current.select(editor, child);
          notifySelection(editor);
          return true;
        }
        if (!parent) return false;
        return commitEditorCommand(editor, {
          kind: 'insert',
          definition,
          parentId: payloadNodeId(parent),
        });
      },
      insertReusable(reusableId, mode, placement) {
        const editor = editorRef.current;
        if (!editor || documentKind !== 'page') return false;
        const source = reusableRuntimeRef.current.find(
          (candidate) => candidate.id === reusableId,
        );
        if (!source) return false;
        const definition =
          mode === 'linked'
            ? createReusableInstanceDefinition(reusableId)
            : reusableDocumentToEditorDefinition(
                source.document,
                designSystemRef.current,
              );
        const childType =
          mode === 'linked'
            ? 'reusable-instance'
            : definition.attributes?.[BUILDER_NODE_TYPE_ATTRIBUTE];
        if (!isPayloadNodeType(childType)) return false;
        if (placement) {
          const target = findPayloadComponent(getRoot(editor), placement.targetNodeId);
          if (!target) return false;
          if (placement.position === 'inside') {
            if (!canInsertIntoComponent(target, childType)) return false;
            return commitEditorCommand(editor, {
              kind: 'insert',
              definition,
              parentId: placement.targetNodeId,
            });
          }
          const parent = target.parent();
          if (!parent || !canInsertIntoComponent(parent, childType)) return false;
          return commitEditorCommand(editor, {
            kind: 'insert',
            definition,
            targetId: placement.targetNodeId,
            position: placement.position,
          });
        }
        if (childType === 'root') return false;
        const insertType = childType as BuilderBlockType;
        const selected = getSelectedComponent(editor);
        const selectedType = selected?.getAttributes({ noStyle: true })[
          BUILDER_NODE_TYPE_ATTRIBUTE
        ];
        const target =
          selected &&
          isPayloadNodeType(selectedType) &&
          canInsertIntoComponent(selected, childType)
            ? selected
            : findAppendTarget(getRoot(editor), insertType);
        const parent = target ?? getRoot(editor);
        if (!canInsertIntoComponent(parent, insertType)) return false;
        const result = commitEditorCommandResult(editor, {
          kind: 'insert',
          definition,
          parentId: payloadNodeId(parent),
        });
        if (result.selection) {
          selectingComponentRef.current = true;
          selectionRef.current.select(editor, result.selection);
          selectingComponentRef.current = false;
          notifySelection(editor);
        }
        return result.changed;
      },
      getSelectedReusableDocument() {
        const editor = editorRef.current;
        const selected = editor ? getSelectedComponent(editor) : undefined;
        if (!editor || !selected || payloadNodeType(selected) === 'root') return null;
        try {
          return serializeReusableSubtree(snapshotFromGrapesComponent(selected));
        } catch {
          return null;
        }
      },
      detachSelectedReusable(document) {
        const editor = editorRef.current;
        const selected = editor ? getSelectedComponent(editor) : undefined;
        const nodeId =
          selected && payloadNodeType(selected) === 'reusable-instance'
            ? payloadNodeId(selected)
            : undefined;
        if (!editor || !nodeId) return false;
        const result = commitEditorCommandResult(editor, {
          kind: 'detach-reusable',
          nodeId,
          definition: reusableDocumentToEditorDefinition(
            document,
            designSystemRef.current,
          ),
        });
        if (result.selection) {
          selectionRef.current.select(editor, result.selection);
          notifySelection(editor);
        }
        return result.changed;
      },
      addStructuralChild(slotName, requestedChildType) {
        const editor = editorRef.current;
        if (!editor) return false;
        const parent = getSelectedComponent(editor);
        if (!parent) return false;
        const parentType = payloadNodeType(parent);
        if (!parentType) return false;
        const slot = slotName
          ? PAGE_COMPONENT_REGISTRY[parentType].slots.find(
              (candidate) => candidate.name === slotName && candidate.structural,
            )
          : PAGE_COMPONENT_REGISTRY[parentType].slots.find(
              (candidate) =>
                candidate.structural &&
                candidate.accepts.some((candidateType) =>
                  canInsertIntoComponent(parent, candidateType),
                ),
            );
        const childType = requestedChildType ?? slot?.accepts[0];
        if (!childType || childType === 'root' || childType === 'reusable-instance')
          return false;
        if (
          !slot ||
          !slot.accepts.includes(childType) ||
          !canInsertIntoComponent(parent, childType)
        ) {
          return false;
        }
        return commitEditorCommand(editor, {
          kind: 'insert-child',
          parentId: payloadNodeId(parent) ?? '',
          slotName: slot.name,
          childType: childType as BuilderBlockType,
        });
      },
      removeStructuralChild(nodeId) {
        const editor = editorRef.current;
        return editor ? commitEditorCommand(editor, { kind: 'remove', nodeId }) : false;
      },
      moveStructuralChild(nodeId, direction) {
        const editor = editorRef.current;
        const parent = editor && getSelectedComponent(editor);
        if (!editor || !parent) return false;
        const child = findPayloadComponent(parent, nodeId);
        if (!child || child.parent() !== parent) return false;
        const parentType = payloadNodeType(parent);
        const childType = payloadNodeType(child);
        const slot =
          parentType && childType
            ? resolveSlotsForChild(parentType, childType).find(
                (candidate) => candidate.structural,
              )
            : undefined;
        if (!slot) return false;
        const siblings = parent.components().models.filter((candidate) => {
          const ownedSlot = candidate.getAttributes({ noStyle: true })[
            BUILDER_NODE_SLOT_ATTRIBUTE
          ];
          return typeof ownedSlot === 'string'
            ? ownedSlot === slot.name
            : slot.accepts.includes(payloadNodeType(candidate) as never);
        });
        const index = siblings.indexOf(child);
        const target = siblings[index + (direction === 'up' ? -1 : 1)];
        const sourceId = payloadNodeId(child);
        const targetId = target && payloadNodeId(target);
        if (!sourceId || !targetId) return false;
        return commitEditorCommand(editor, {
          kind: 'move',
          intent: {
            nodeId: sourceId,
            targetNodeId: targetId,
            position: direction === 'up' ? 'before' : 'after',
          },
        });
      },
      duplicateStructuralChild(nodeId) {
        const editor = editorRef.current;
        return editor
          ? commitEditorCommand(editor, { kind: 'duplicate', nodeId })
          : false;
      },
      validateMove(intent) {
        const editor = editorRef.current;
        if (!editor) return { valid: false, reason: 'Builder editor is not ready.' };
        const root = getRoot(editor);
        const result = validateNodeIntent(root, intent);
        return result.valid ? { valid: true } : { valid: false, reason: result.reason };
      },
      scrollToCanvasPoint(x, y) {
        const editor = editorRef.current;
        if (!editor) return;
        scrollCanvasToPoint(editor, x, y);
        window.setTimeout(() => {
          if (editorRef.current === editor) scheduleCanvasState(editor);
        }, 120);
      },
      setCanvasZoom(zoom) {
        const editor = editorRef.current;
        if (!editor) return;
        editor.Canvas.setZoom(Math.min(Math.max(zoom, 25), 200));
        scheduleCanvasState(editor);
      },
      fitCanvas() {
        const editor = editorRef.current;
        if (!editor) return;
        editor.Canvas.fitViewport({ gap: 24 });
        scheduleCanvasState(editor);
      },
      setInteractionMode(mode) {
        interactionModeRef.current = mode;
        if (editorRef.current) setCanvasInteractionClass(editorRef.current, mode);
        callbacksRef.current.onInteractionModeChange(mode);
      },
      moveNode(intent) {
        const editor = editorRef.current;
        return editor ? commitStructuralMove(editor, intent) : false;
      },
      moveSelected(direction) {
        const editor = editorRef.current;
        if (!editor) return false;
        const selected = getSelectedComponent(editor);
        const intent = selected
          ? selectedMoveIntent(getRoot(editor), selected, direction)
          : undefined;
        return intent ? commitStructuralMove(editor, intent) : false;
      },
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    syncValidationIndicators(getRoot(editor), validationIssues);
  }, [validationIssues]);

  useEffect(() => {
    let disposed = false;
    let editor: Editor | null = null;
    let unbindCanvasComponentDrag: (() => void) | undefined;
    let unbindRuntimePreviewClasses: (() => void) | undefined;
    let bindCanvasComponentDragWhenReady: (() => void) | undefined;
    let unbindCanvasStateObservers: (() => void) | undefined;
    let bindCanvasStateObservers: (() => void) | undefined;
    const handleComponentClone = (clone: Component) => {
      if (disposed || !editor) return;
      const cloneSnapshot = snapshotFromGrapesComponent(clone);
      if (collectPersistedNodeIds(cloneSnapshot).size === 0) return;
      const wasInternalChange = internalChangeRef.current;
      internalChangeRef.current = true;
      try {
        // GrapesJS creates a new internal model ID but copies custom Payload
        // identity attributes verbatim. Remap the Payload IDs before the
        // cloned model is inserted, so Layers/Canvas/React never see a stale
        // identity during copy/paste or the native toolbar clone lifecycle.
        refreshClonedComponentIdentity(editor, clone);
      } finally {
        internalChangeRef.current = wasInternalChange;
      }
    };

    const handleInteractionKeyDown = (event: KeyboardEvent) => {
      const currentEditor = editorRef.current;
      if (isEditableTarget(event.target)) return;
      const consume = () => {
        event.preventDefault();
        // GrapesJS registers its own global keymap listener. Stop it from
        // applying a second undo/redo/delete after the command bus handles
        // this user action.
        event.stopImmediatePropagation();
      };
      if (event.key === 'Escape') {
        blockDragCleanupRef.current?.();
        callbacksRef.current.onInteractionModeChange('select');
        interactionModeRef.current = 'select';
        if (currentEditor) setCanvasInteractionClass(currentEditor, 'select');
        event.preventDefault();
        return;
      }
      if (currentEditor && (event.metaKey || event.ctrlKey)) {
        if (event.key.toLowerCase() === 'z') {
          if (event.shiftKey)
            currentEditor && commitEditorCommand(currentEditor, { kind: 'redo' });
          else commitEditorCommand(currentEditor, { kind: 'undo' });
          consume();
          return;
        }
        if (event.key.toLowerCase() === 'y') {
          commitEditorCommand(currentEditor, { kind: 'redo' });
          consume();
          return;
        }
        if (event.key.toLowerCase() === 'd') {
          const selected = getSelectedComponent(currentEditor);
          const nodeId = selected && payloadNodeId(selected);
          if (nodeId) commitEditorCommand(currentEditor, { kind: 'duplicate', nodeId });
          consume();
          return;
        }
      }
      if (currentEditor && (event.key === 'Delete' || event.key === 'Backspace')) {
        const selected = getSelectedComponent(currentEditor);
        const nodeId = selected && payloadNodeId(selected);
        if (nodeId && selected !== getRoot(currentEditor)) {
          commitEditorCommand(currentEditor, { kind: 'remove', nodeId });
          consume();
        }
        return;
      }
      if ((event.key === 'v' || event.key === 'V') && !event.metaKey && !event.ctrlKey) {
        interactionModeRef.current = 'select';
        if (currentEditor) setCanvasInteractionClass(currentEditor, 'select');
        callbacksRef.current.onInteractionModeChange('select');
        consume();
        return;
      }
      if ((event.key === 'h' || event.key === 'H') && !event.metaKey && !event.ctrlKey) {
        interactionModeRef.current = 'hand';
        if (currentEditor) setCanvasInteractionClass(currentEditor, 'hand');
        callbacksRef.current.onInteractionModeChange('hand');
        consume();
        return;
      }
      if (event.code === 'Space' && !event.repeat) {
        temporaryPanRef.current = true;
        if (currentEditor)
          setCanvasInteractionClass(currentEditor, interactionModeRef.current, true);
        consume();
        return;
      }
      if (!event.altKey || !currentEditor) return;
      const direction =
        event.key === 'ArrowUp'
          ? 'up'
          : event.key === 'ArrowDown'
            ? 'down'
            : event.key === 'ArrowLeft'
              ? 'outdent'
              : event.key === 'ArrowRight'
                ? 'indent'
                : undefined;
      if (!direction) return;
      const selected = getSelectedComponent(currentEditor);
      const intent = selected
        ? selectedMoveIntent(getRoot(currentEditor), selected, direction)
        : undefined;
      if (intent) commitStructuralMove(currentEditor, intent);
      consume();
    };
    const handleInteractionKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      temporaryPanRef.current = false;
      if (editorRef.current)
        setCanvasInteractionClass(editorRef.current, interactionModeRef.current);
    };
    // Capture before GrapesJS' document keymap so a shortcut is dispatched
    // exactly once through the CMS command boundary.
    window.addEventListener('keydown', handleInteractionKeyDown, true);
    window.addEventListener('keyup', handleInteractionKeyUp);

    async function initialize() {
      try {
        const grapesModule = await import('grapesjs');
        if (disposed || !containerRef.current) return;
        const grapesjs = grapesModule.default;
        editor = grapesjs.init({
          container: containerRef.current,
          fromElement: false,
          height: '100%',
          width: 'auto',
          storageManager: false,
          panels: { defaults: [] },
          blockManager: {
            blocks: createBlockManagerDefinitions(documentKind),
            custom: true,
          },
          styleManager: { sectors: [] },
          canvas: { scrollableCanvas: true },
          canvasCss: `
            ${PAGE_RUNTIME_BASELINE_CSS}
            [data-payload-form-preview] {
              pointer-events: none;
            }
            [data-payload-node-type].gjs-selected {
              outline: 2px solid #4d78ff;
              outline-offset: 2px;
            }
            [data-builder-validation-node="true"] {
              outline: 2px solid #df627c !important;
              outline-offset: 3px;
            }
            [data-payload-node-type].builder-drag-source {
              opacity: 0.28;
            }
            [data-payload-node-type] {
              cursor: grab;
            }
            [data-payload-node-type]:active,
            [data-payload-node-type].builder-drag-source {
              cursor: grabbing;
            }
            .builder-drag-ghost {
              position: fixed !important;
              z-index: 1000 !important;
              display: block !important;
              margin: 0 !important;
              opacity: 0.84 !important;
              pointer-events: none !important;
              box-shadow: 0 14px 30px #17203333 !important;
              transform: rotate(1deg) !important;
            }
            .builder-drop-indicator {
              position: fixed;
              z-index: 1100;
              display: none;
              border: 2px solid #4d78ff;
              border-radius: 6px;
              background: #4d78ff12;
              pointer-events: none;
            }
            .builder-drop-indicator[data-position="before"],
            .builder-drop-indicator[data-position="after"] {
              border: 0;
              border-radius: 3px;
              background: #4d78ff;
              box-shadow: 0 0 0 2px #4d78ff33;
            }
            .builder-drop-indicator.invalid {
              border-color: #df627c;
              background: #df627c18;
              box-shadow: 0 0 0 2px #df627c33;
            }
            body.builder-hand-mode,
            body.builder-hand-mode * {
              cursor: grab !important;
            }
            body.builder-canvas-panning,
            body.builder-canvas-panning * {
              cursor: grabbing !important;
            }
            [data-payload-node-type] { transition: outline-color 120ms ease; }
            [data-payload-node-type="text"][data-payload-text-align="left"] { text-align: left; }
            [data-payload-node-type="text"][data-payload-text-align="center"] { text-align: center; }
            [data-payload-node-type="text"][data-payload-text-align="right"] { text-align: right; }
          `,
          deviceManager: {
            default: 'desktop',
            devices: [
              {
                id: 'desktop',
                name: PAGE_RESPONSIVE_BREAKPOINTS.desktop.label,
                width: PAGE_RESPONSIVE_BREAKPOINTS.desktop.canvasWidth,
              },
              {
                id: 'tablet',
                name: PAGE_RESPONSIVE_BREAKPOINTS.tablet.label,
                width: PAGE_RESPONSIVE_BREAKPOINTS.tablet.canvasWidth,
                widthMedia: PAGE_RESPONSIVE_BREAKPOINTS.tablet.editorMediaQuery,
              },
              {
                id: 'mobile',
                name: PAGE_RESPONSIVE_BREAKPOINTS.mobile.label,
                width: PAGE_RESPONSIVE_BREAKPOINTS.mobile.canvasWidth,
                widthMedia: PAGE_RESPONSIVE_BREAKPOINTS.mobile.editorMediaQuery,
              },
            ],
          },
        });
        editorRef.current = editor;
        editor.on('component:clone', handleComponentClone);
        commandBusRef.current = createEditorCommandBus(
          editor,
          designSystem ? { designSystem } : {},
        );
        editor.setComponents(
          payloadToEditorComponent(payloadRef.current, {
            reusableRuntime: reusableRuntimeRef.current,
            ...(designSystemRef.current ? { designSystem: designSystemRef.current } : {}),
            projectionContext: projectionContextRef.current,
          }),
        );
        initialPersistedSignatureRef.current = pageDocumentSignature(
          createDocumentSnapshot(editor),
        );
        editor
          .getModel()
          .skip(() =>
            applyAllViewportStyles(
              getRoot(editor as Editor),
              viewportRef.current,
              designSystemRef.current,
            ),
          );
        ensureAllFormPreviews(getRoot(editor));
        syncRuntimePreviewClasses(getRoot(editor));
        syncValidationIndicators(getRoot(editor), validationIssuesRef.current);
        window.setTimeout(() => syncRuntimePreviewClasses(getRoot(editor as Editor)), 0);
        // The persisted root is an explicit <main> component. Keep GrapesJS'
        // implicit body wrapper out of the editable PagePayloadV1 tree.
        editor.getWrapper()?.set({ droppable: false, selectable: false });
        bindCanvasComponentDragWhenReady = () => {
          unbindCanvasComponentDrag?.();
          unbindRuntimePreviewClasses?.();
          syncRuntimePreviewClasses(getRoot(editor as Editor));
          syncValidationIndicators(
            getRoot(editor as Editor),
            validationIssuesRef.current,
          );
          applyAllViewportStyles(
            getRoot(editor as Editor),
            viewportRef.current,
            designSystemRef.current,
          );
          window.setTimeout(() => {
            if (editorRef.current === editor)
              syncRuntimePreviewClasses(getRoot(editor as Editor));
          }, 50);
          const frameDocument = editor?.Canvas.getFrameEl()?.contentDocument;
          if (frameDocument?.body && typeof MutationObserver !== 'undefined') {
            const observer = new MutationObserver(() => {
              if (editorRef.current === editor) {
                syncRuntimePreviewClasses(getRoot(editor as Editor));
                syncValidationIndicators(
                  getRoot(editor as Editor),
                  validationIssuesRef.current,
                );
                applyAllViewportStyles(
                  getRoot(editor as Editor),
                  viewportRef.current,
                  designSystemRef.current,
                );
              }
            });
            observer.observe(frameDocument.body, { childList: true, subtree: true });
            unbindRuntimePreviewClasses = () => observer.disconnect();
          }
          unbindCanvasComponentDrag = bindCanvasComponentDrag(
            editor as Editor,
            interactionModeRef,
            temporaryPanRef,
            (intent) => commitStructuralMove(editor as Editor, intent),
            handleInteractionKeyDown,
          );
        };
        bindCanvasComponentDragWhenReady();
        editor.on('canvas:frame:load:body', bindCanvasComponentDragWhenReady);
        window.setTimeout(bindCanvasComponentDragWhenReady, 0);
        bindCanvasStateObservers = () => {
          unbindCanvasStateObservers?.();
          const canvasElement = editor?.Canvas.getCanvasView().el;
          const frameDocument = editor?.Canvas.getFrameEl()?.contentDocument;
          const frameWindow = frameDocument?.defaultView;
          const frameScrollElement = frameDocument?.scrollingElement;
          const onCanvasViewportChange = () => {
            if (editor) scheduleCanvasState(editor);
          };
          canvasElement?.addEventListener('scroll', onCanvasViewportChange, {
            passive: true,
          });
          frameWindow?.addEventListener('scroll', onCanvasViewportChange, {
            passive: true,
          });
          frameDocument?.addEventListener('scroll', onCanvasViewportChange, {
            capture: true,
            passive: true,
          });
          frameScrollElement?.addEventListener('scroll', onCanvasViewportChange, {
            capture: true,
            passive: true,
          });
          window.addEventListener('resize', onCanvasViewportChange);
          const resizeObserver =
            typeof ResizeObserver === 'undefined'
              ? undefined
              : new ResizeObserver(onCanvasViewportChange);
          if (resizeObserver) {
            if (canvasElement) resizeObserver.observe(canvasElement);
            const frameBody = editor?.Canvas.getFrameEl()?.contentDocument?.body;
            if (frameBody) resizeObserver.observe(frameBody);
          }
          scheduleCanvasState(editor as Editor, true);
          unbindCanvasStateObservers = () => {
            canvasElement?.removeEventListener('scroll', onCanvasViewportChange);
            frameWindow?.removeEventListener('scroll', onCanvasViewportChange);
            frameDocument?.removeEventListener('scroll', onCanvasViewportChange, true);
            frameScrollElement?.removeEventListener(
              'scroll',
              onCanvasViewportChange,
              true,
            );
            window.removeEventListener('resize', onCanvasViewportChange);
            resizeObserver?.disconnect();
          };
        };
        bindCanvasStateObservers();
        editor.on('canvas:frame:load:body', bindCanvasStateObservers);
        window.setTimeout(() => bindCanvasStateObservers?.(), 0);
        if (process.env.NODE_ENV !== 'production') {
          window.__payloadBuilderDebug = {
            getPayload: () =>
              serializeGrapesComponent(getRoot(editor as Editor), documentKind),
            setCanvasZoom: (zoom) => (editor as Editor).Canvas.setZoom(zoom),
          };
        }
        const handleComponentUpdate = () => {
          if (editorRef.current !== editor) return;
          window.setTimeout(() => {
            if (editorRef.current === editor) {
              syncRuntimePreviewClasses(getRoot(editor as Editor));
              syncValidationIndicators(
                getRoot(editor as Editor),
                validationIssuesRef.current,
              );
              applyAllViewportStyles(
                getRoot(editor as Editor),
                viewportRef.current,
                designSystemRef.current,
              );
            }
          }, 0);
          let persistedDocumentChanged = true;
          try {
            persistedDocumentChanged =
              pageDocumentSignature(createDocumentSnapshot(editor as Editor)) !==
              initialPersistedSignatureRef.current;
          } catch {
            persistedDocumentChanged = true;
          }
          if (
            !internalChangeRef.current &&
            !initializationSettlingRef.current &&
            persistedDocumentChanged
          ) {
            callbacksRef.current.onDirty();
            notifyDocumentChange(editor as Editor);
          }
          notifySelection(editor as Editor);
          notifyHistory(editor as Editor);
          scheduleCanvasState(editor as Editor, true);
        };
        const handleSelectionChange = () => {
          const selected = (editor as Editor).getSelected();
          const pendingSelectionId = pendingProgrammaticSelectionRef.current;
          if (pendingSelectionId) {
            if (!selected) return;
            if (payloadNodeId(selected) !== pendingSelectionId) return;
          }
          if (!selected) {
            if (selectingComponentRef.current) return;
            selectionRef.current.clear();
            callbacksRef.current.onSelectionChange(null);
            return;
          }
          selectionRef.current.set(selected);
          callbacksRef.current.onSelectionChange(selectionFromComponent(selected));
        };
        const handleComponentDragEnd = () => handleComponentUpdate();
        // GrapesJS emits `component:input` for every RTE keystroke. Refresh the
        // selected snapshot from the live model so Canvas inline edits appear
        // in Content without requiring a second selection.
        const handleComponentInput = () => {
          notifySelection(editor as Editor);
          notifyHistory(editor as Editor);
          scheduleCanvasState(editor as Editor, false);
        };
        const handleHistoryChange = () => notifyHistory(editor as Editor);

        editor.on('component:update', handleComponentUpdate);
        editor.on('component:add', handleComponentUpdate);
        editor.on('component:remove', handleComponentUpdate);
        editor.on('component:drag:end', handleComponentDragEnd);
        editor.on('component:styleUpdate', handleComponentUpdate);
        editor.on('component:input', handleComponentInput);
        editor.on('component:selected', handleSelectionChange);
        editor.on('component:deselected', handleSelectionChange);
        editor.on('undo', handleHistoryChange);
        editor.on('redo', handleHistoryChange);
        const handleCanvasViewportChange = () => scheduleCanvasState(editor as Editor);
        editor.on('canvas:coords', handleCanvasViewportChange);
        editor.on('canvas:zoom', handleCanvasViewportChange);
        editor.on('canvas:update', handleComponentUpdate);
        editor.on('device', handleComponentUpdate);
        scheduleCanvasState(editor, true);
        notifyHistory(editor);
        callbacksRef.current.onReady();
        // GrapesJS can emit canvas/layout updates immediately after the model
        // is mounted. They describe initialization, not an authored edit.
        window.setTimeout(() => {
          if (editorRef.current === editor) initializationSettlingRef.current = false;
        }, 250);
      } catch (caughtError) {
        callbacksRef.current.onError(
          caughtError instanceof Error
            ? caughtError.message
            : 'GrapesJS failed to initialize',
        );
      }
    }

    void initialize();

    return () => {
      disposed = true;
      window.removeEventListener('keydown', handleInteractionKeyDown, true);
      window.removeEventListener('keyup', handleInteractionKeyUp);
      blockDragCleanupRef.current?.();
      unbindCanvasComponentDrag?.();
      unbindRuntimePreviewClasses?.();
      unbindCanvasStateObservers?.();
      if (canvasStateFrameRef.current !== null) {
        window.cancelAnimationFrame(canvasStateFrameRef.current);
        canvasStateFrameRef.current = null;
      }
      if (editor && bindCanvasComponentDragWhenReady) {
        editor.off('canvas:frame:load:body', bindCanvasComponentDragWhenReady);
      }
      if (editor && bindCanvasStateObservers) {
        editor.off('canvas:frame:load:body', bindCanvasStateObservers);
      }
      if (editor) editor.off('component:clone', handleComponentClone);
      if (window.__payloadBuilderDebug) {
        delete window.__payloadBuilderDebug;
      }
      editorRef.current = null;
      commandBusRef.current = null;
      editor?.destroy();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="builder-editor-host"
      aria-label="Visual page editor"
    />
  );
});

GrapesEditor.displayName = 'GrapesEditor';

export const BUILDER_VIEWPORTS = allViewports;
