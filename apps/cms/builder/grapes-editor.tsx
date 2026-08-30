'use client';

import type { BlockProperties, Component, Editor } from 'grapesjs';
import {
  BUILDER_FORM_PREVIEW_ATTRIBUTE,
  BUILDER_NODE_ID_ATTRIBUTE,
  BUILDER_NODE_TYPE_ATTRIBUTE,
  BUILDER_FORM_PROPS_ATTRIBUTE,
  BUILDER_COUNTDOWN_PROPS_ATTRIBUTE,
  BUILDER_TEXT_ALIGN_ATTRIBUTE,
  type BuilderNodeType,
  type BuilderBlockType,
  type BuilderViewport,
  applyEditorViewportStyle,
  captureEditorViewportStyle,
  createBlockDefinition,
  createExtensionBlockDefinition,
  countdownPreviewComponents,
  formPreviewComponents,
  isBuilderNodeType,
  payloadToEditorComponent,
  readEditorResponsiveStyle,
  reassignEditorNodeIds,
  serializeGrapesComponent,
} from './builder-adapter';
import {
  canInsertNode,
  findPayloadComponent,
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
} from './editor-commands';
import { BuilderSelection } from './builder-selection';
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
  type FormProps,
  type PageDocument,
  type PageNodeStyle,
  type PagePayload,
} from '@payload/contracts';

export type SelectedBuilderNode = {
  id: string;
  type: BuilderNodeType;
  text?: string;
  label?: string;
  href?: string;
  target?: '_self' | '_blank';
  src?: string;
  alt?: string;
  align?: 'left' | 'center' | 'right';
  style?: PageNodeStyle;
  form?: FormProps;
  countdown?: { targetAt: string; label: string };
};

type BuilderDebugApi = {
  getPayload: () => PagePayload;
  setCanvasZoom: (zoom: number) => void;
};

declare global {
  interface Window {
    __payloadBuilderDebug?: BuilderDebugApi;
  }
}

export type GrapesEditorHandle = {
  addBlock: (type: BuilderBlockType) => void;
  addExtensionBlock: (extensionId: string) => void;
  startBlockDrag: (type: BuilderBlockType, event: Event) => void;
  duplicateSelected: () => void;
  deleteSelected: () => void;
  undo: () => void;
  redo: () => void;
  getDocument: () => PageDocument;
  serialize: () => PagePayload;
  setViewport: (viewport: BuilderViewport) => void;
  updateSelectedText: (value: string) => void;
  updateSelectedAttribute: (
    name: 'href' | 'target' | 'src' | 'alt',
    value: string,
  ) => void;
  updateSelectedAlign: (value: SelectedBuilderNode['align']) => void;
  updateSelectedStyle: (property: string, value: string) => void;
  resetSelectedStyle: (property: string) => void;
  updateSelectedForm: (form: FormProps) => void;
  updateSelectedCountdown: (props: { targetAt: string; label: string }) => void;
  selectAsset: (src: string) => void;
  selectNode: (id: string) => void;
  selectParent: () => void;
  insertBlock: (
    type: BuilderBlockType,
    placement?: { targetNodeId: string; position: DropPosition },
  ) => boolean;
  validateMove: (intent: MoveNodeIntent) => { valid: boolean; reason?: string };
  scrollToCanvasPoint: (x: number, y: number) => void;
  setCanvasZoom: (zoom: number) => void;
  fitCanvas: () => void;
  setInteractionMode: (mode: InteractionMode) => void;
  moveNode: (intent: MoveNodeIntent) => boolean;
  moveSelected: (direction: 'up' | 'down' | 'outdent' | 'indent') => boolean;
};

export type InteractionMode = 'select' | 'hand';

type GrapesEditorProps = {
  initialPayload: PagePayload;
  onDirty: () => void;
  onDocumentChange: (document: PageDocument) => void;
  onSelectionChange: (node: SelectedBuilderNode | null) => void;
  onReady: () => void;
  onHistoryChange: (state: { canUndo: boolean; canRedo: boolean }) => void;
  onCanvasStateChange: (state: BuilderCanvasState) => void;
  onInteractionModeChange: (mode: InteractionMode) => void;
  onError: (message: string) => void;
};

const allViewports: BuilderViewport[] = ['desktop', 'tablet', 'mobile'];

function isPayloadNodeType(value: unknown): value is BuilderNodeType {
  return isBuilderNodeType(value);
}

function selectionFromComponent(
  component: Component | undefined,
): SelectedBuilderNode | null {
  if (!component) {
    return null;
  }

  const attributes = component.getAttributes({ noStyle: true });
  const type = attributes[BUILDER_NODE_TYPE_ATTRIBUTE];
  const id = attributes[BUILDER_NODE_ID_ATTRIBUTE];
  if (!isPayloadNodeType(type) || typeof id !== 'string') {
    return null;
  }

  const content = String(component.get('content') ?? '');
  const align = attributes[BUILDER_TEXT_ALIGN_ATTRIBUTE];
  const target = attributes.target;
  const responsiveStyle = readEditorResponsiveStyle(component);
  let form: FormProps | undefined;
  let countdown: SelectedBuilderNode['countdown'];
  if (type === 'form') {
    const rawForm = attributes[BUILDER_FORM_PROPS_ATTRIBUTE];
    if (typeof rawForm === 'string') {
      try {
        form = JSON.parse(rawForm) as FormProps;
      } catch {
        form = undefined;
      }
    }
  }
  if (type === 'countdown') {
    const raw = attributes[BUILDER_COUNTDOWN_PROPS_ATTRIBUTE];
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          typeof (parsed as { targetAt?: unknown }).targetAt === 'string' &&
          typeof (parsed as { label?: unknown }).label === 'string'
        ) {
          countdown = parsed as { targetAt: string; label: string };
        }
      } catch {
        countdown = undefined;
      }
    }
  }
  return {
    id,
    type,
    ...(type === 'text'
      ? {
          text: content,
          ...(align === 'left' || align === 'center' || align === 'right'
            ? { align }
            : {}),
        }
      : {}),
    ...(type === 'button'
      ? {
          label: content,
          ...(typeof attributes.href === 'string' ? { href: attributes.href } : {}),
          ...(target === '_self' || target === '_blank' ? { target } : {}),
        }
      : {}),
    ...(type === 'image'
      ? {
          ...(typeof attributes.src === 'string' ? { src: attributes.src } : {}),
          ...(typeof attributes.alt === 'string' ? { alt: attributes.alt } : {}),
        }
      : {}),
    ...(responsiveStyle ? { style: responsiveStyle } : {}),
    ...(form ? { form } : {}),
    ...(countdown ? { countdown } : {}),
  };
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
    if (target && !canInsertNode(payloadNodeType(target) ?? 'text', sourceType)) {
      const parent = payloadAncestor(target.parent());
      const parentType = parent ? payloadNodeType(parent) : undefined;
      if (
        parent &&
        parentType &&
        parentType !== 'root' &&
        canInsertNode(parentType, sourceType)
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

function dropBlockAtPoint(
  editor: Editor,
  type: BuilderBlockType,
  clientX: number,
  clientY: number,
): Component | undefined {
  const frame = editor.Canvas.getFrameEl();
  if (!frame) return undefined;

  const root = editor.getComponents().models[0];
  if (!root) return undefined;

  const frameRect = frame.getBoundingClientRect();
  const frameDocument = frame.contentDocument;
  if (!frameDocument) return undefined;

  const points = [
    { x: clientX - frameRect.left, y: clientY - frameRect.top },
    { x: clientX, y: clientY },
  ];
  let target: Component | undefined;
  for (const point of points) {
    const element = frameDocument.elementFromPoint(point.x, point.y);
    let candidate = element ? componentForCanvasElement(root, element) : undefined;
    while (candidate) {
      const targetType = candidate.getAttributes({ noStyle: true })[
        BUILDER_NODE_TYPE_ATTRIBUTE
      ];
      if (
        isPayloadNodeType(targetType) &&
        (canInsertNode(targetType, type) ||
          (targetType === 'root' &&
            ['text', 'image', 'button', 'countdown'].includes(type)))
      ) {
        target = candidate;
        break;
      }
      candidate = candidate.parent() ?? undefined;
    }
    if (target) break;
  }
  if (!target) return undefined;

  if (
    target === root &&
    (type === 'text' || type === 'image' || type === 'button' || type === 'countdown')
  ) {
    const section = executeEditorCommand(editor, {
      kind: 'insert',
      definition: createBlockDefinition('section'),
      parentId: payloadNodeId(root),
    });
    target = section.selection ?? root;
  }
  const result = executeEditorCommand(editor, {
    kind: 'insert',
    definition: createBlockDefinition(type),
    parentId: payloadNodeId(target),
  });
  const added = result.selection;
  if (added) editor.select(added);
  return added;
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
    if (isPayloadNodeType(type) && canInsertNode(type, childType)) {
      target = component;
    }
  });
  return target;
}

function captureAllViewportStyles(root: Component, viewport: BuilderViewport): void {
  root.onAll((component) => captureEditorViewportStyle(component, viewport));
}

function applyAllViewportStyles(root: Component, viewport: BuilderViewport): void {
  root.onAll((component) => applyEditorViewportStyle(component, viewport));
}

type BuiltInBuilderBlockType = Exclude<BuilderBlockType, 'extension'>;

const blockTypes: readonly BuiltInBuilderBlockType[] = [
  ...(Object.keys(PAGE_COMPONENT_REGISTRY).filter(
    (type): type is BuiltInBuilderBlockType => type !== 'root' && type !== 'extension',
  ) as BuiltInBuilderBlockType[]),
];

function createBlockManagerDefinitions(): BlockProperties[] {
  return blockTypes.map((type) => ({
    category: 'PagePayloadV1',
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
  let match: Component | undefined;
  root.onAll((component) => {
    if (match) return;
    const componentId = component.getAttributes({ noStyle: true })[
      BUILDER_NODE_ID_ATTRIBUTE
    ];
    if (componentId === id) match = component;
  });
  return match;
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
    initialPayload,
    onDirty,
    onDocumentChange,
    onSelectionChange,
    onReady,
    onHistoryChange,
    onCanvasStateChange,
    onInteractionModeChange,
    onError,
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
  const viewportRef = useRef<BuilderViewport>('desktop');
  const internalChangeRef = useRef(false);
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
  });
  const payloadRef = useRef(initialPayload);
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
  };

  function getRoot(editor: Editor): Component {
    const root = editor.getComponents().models[0];
    if (!root) {
      throw new Error('Builder editor root is missing');
    }
    return root;
  }

  function notifySelection(editor: Editor): void {
    const selected = editor.getSelected();
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
    const selected = editor.getSelected();
    if (selected) {
      selectionRef.current.set(selected);
      return selected;
    }
    return selectionRef.current.resolve(getRoot(editor));
  }

  function notifyHistory(editor: Editor): void {
    callbacksRef.current.onHistoryChange({
      canRedo: editor.UndoManager.hasRedo(),
      canUndo: editor.UndoManager.hasUndo(),
    });
  }

  function createDocumentSnapshot(editor: Editor): PageDocument {
    const root = getRoot(editor);
    captureAllViewportStyles(root, viewportRef.current);
    return createPageDocument(serializeGrapesComponent(root));
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

  function commitEditorCommand(editor: Editor, command: EditorCommand): boolean {
    // GrapesJS emits component events for the same mutation. Suppress those
    // observer-side dirty notifications while the command is committing so a
    // user action creates one coherent document/dirty update.
    const wasInternalChange = internalChangeRef.current;
    internalChangeRef.current = true;
    const result =
      commandBusRef.current?.dispatch(command) ?? executeEditorCommand(editor, command);
    queueMicrotask(() => {
      internalChangeRef.current = wasInternalChange;
    });
    if (!result.changed) return false;
    if (result.selection) {
      selectionRef.current.select(editor, result.selection);
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
    return true;
  }

  useImperativeHandle(ref, () => {
    const serializeDocument = (): PageDocument => {
      const editor = editorRef.current;
      if (!editor) {
        throw new Error('Builder editor is not ready');
      }
      return createDocumentSnapshot(editor);
    };

    return {
      addBlock(type) {
        const editor = editorRef.current;
        if (!editor) return;
        const definition = createBlockDefinition(type);
        const selected = editor.getSelected();
        const selectedType = selected?.getAttributes({ noStyle: true })[
          BUILDER_NODE_TYPE_ATTRIBUTE
        ];
        const target =
          selected && isPayloadNodeType(selectedType) && canInsertNode(selectedType, type)
            ? selected
            : findAppendTarget(getRoot(editor), type);

        let parent: Component | undefined = target ?? undefined;
        if (!parent && (type === 'section' || type === 'container')) {
          parent = getRoot(editor);
        } else if (!parent) {
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
        const added = result ? getSelectedComponent(editor) : undefined;
        if (added) {
          if (type === 'form') ensureFormPreview(added);
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
          canInsertNode(selectedType, 'extension')
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
      startBlockDrag(type, event) {
        const editor = editorRef.current;
        if (!editor) return;
        const mouseEvent = event as MouseEvent;
        if (mouseEvent.button !== 0) return;

        blockDragCleanupRef.current?.();
        const state = {
          startX: mouseEvent.clientX,
          startY: mouseEvent.clientY,
          dragging: false,
        };
        const cleanup = () => {
          window.removeEventListener('mousemove', handleMove, true);
          window.removeEventListener('mouseup', handleUp, true);
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
        const handleUp = (upEvent: MouseEvent) => {
          cleanup();
          if (!state.dragging) return;
          dropBlockAtPoint(editor, type, upEvent.clientX, upEvent.clientY);
        };

        blockDragCleanupRef.current = cleanup;
        window.addEventListener('mousemove', handleMove, true);
        window.addEventListener('mouseup', handleUp, true);
        mouseEvent.preventDefault();
        mouseEvent.stopPropagation();
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
        const selected = editor ? getSelectedComponent(editor) : undefined;
        if (!editor || !selected) return;
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
      },
      updateSelectedCountdown(props) {
        const editor = editorRef.current;
        const selected = editor ? getSelectedComponent(editor) : undefined;
        if (!editor || !selected) return;
        const type = selected.getAttributes({ noStyle: true })[
          BUILDER_NODE_TYPE_ATTRIBUTE
        ];
        if (type !== 'countdown') return;
        const parsed = CountdownPropsSchema.safeParse(props);
        if (!parsed.success) return;
        commitEditorCommand(editor, {
          kind: 'update-props',
          nodeId: payloadNodeId(selected) ?? '',
          components: countdownPreviewComponents(parsed.data),
          attributes: {
            [BUILDER_COUNTDOWN_PROPS_ATTRIBUTE]: JSON.stringify(parsed.data),
          },
        });
      },
      serialize() {
        return serializeDocument().payload;
      },
      setViewport(viewport) {
        const editor = editorRef.current;
        if (!editor || viewport === viewportRef.current) return;
        const root = getRoot(editor);
        const selected = getSelectedComponent(editor);
        const selectedSnapshot = selectionFromComponent(selected);
        internalChangeRef.current = true;
        captureAllViewportStyles(root, viewportRef.current);
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
        applyAllViewportStyles(root, viewport);
        window.setTimeout(() => {
          if (editorRef.current === editor) {
            applyAllViewportStyles(getRoot(editor), viewport);
          }
        }, 0);
        viewportRef.current = viewport;
        callbacksRef.current.onSelectionChange(selectedSnapshot);
        const restoreSelection = () => {
          if (selected && editorRef.current === editor) {
            selectionRef.current.select(editor, selected);
            notifySelection(editor);
          }
        };
        editor.once('canvas:update', restoreSelection);
        window.setTimeout(() => {
          restoreSelection();
          internalChangeRef.current = false;
        }, 500);
      },
      updateSelectedText(value) {
        const editor = editorRef.current;
        if (!editor) return;
        const selected = getSelectedComponent(editor);
        if (!selected) return;
        commitEditorCommand(editor, {
          kind: 'set-content',
          nodeId: payloadNodeId(selected) ?? '',
          content: value,
        });
      },
      updateSelectedAttribute(name, value) {
        const editor = editorRef.current;
        if (!editor) return;
        const selected = getSelectedComponent(editor);
        if (!selected) return;
        commitEditorCommand(editor, {
          kind: 'set-attributes',
          nodeId: payloadNodeId(selected) ?? '',
          attributes: { [name]: value },
        });
      },
      updateSelectedAlign(value) {
        const editor = editorRef.current;
        if (!editor) return;
        const selected = getSelectedComponent(editor);
        if (!selected || !value) return;
        commitEditorCommand(editor, {
          kind: 'set-attributes',
          nodeId: payloadNodeId(selected) ?? '',
          attributes: { [BUILDER_TEXT_ALIGN_ATTRIBUTE]: value },
        });
      },
      updateSelectedStyle(property, value) {
        const editor = editorRef.current;
        if (!editor) return;
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
      },
      resetSelectedStyle(property) {
        const editor = editorRef.current;
        if (!editor) return;
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
      },
      selectAsset(src) {
        const editor = editorRef.current;
        if (!editor) return;
        const selected = getSelectedComponent(editor);
        if (!selected) return;
        commitEditorCommand(editor, {
          kind: 'set-attributes',
          nodeId: payloadNodeId(selected) ?? '',
          attributes: { src },
        });
      },
      selectNode(id) {
        const editor = editorRef.current;
        if (!editor) return;
        const component = findComponentById(getRoot(editor), id);
        if (!component) return;
        selectionRef.current.select(editor, component);
        editor.Canvas.scrollTo(component, {
          behavior: 'auto',
          block: 'center',
        });
        notifySelection(editor);
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
        const definition = createBlockDefinition(type);
        if (placement) {
          if (placement.position === 'inside') {
            const target = findPayloadComponent(getRoot(editor), placement.targetNodeId);
            const targetType = target && payloadNodeType(target);
            if (targetType === 'root' && !canInsertNode(targetType, type)) {
              const sectionResult = commitEditorCommand(editor, {
                kind: 'insert',
                definition: createBlockDefinition('section'),
              });
              const section = sectionResult ? getSelectedComponent(editor) : undefined;
              if (!section) return false;
              return commitEditorCommand(editor, {
                kind: 'insert',
                definition,
                parentId: payloadNodeId(section),
              });
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
          selected && isPayloadNodeType(selectedType) && canInsertNode(selectedType, type)
            ? selected
            : findAppendTarget(getRoot(editor), type);
        let parent: Component | undefined = target ?? undefined;
        if (!parent && (type === 'section' || type === 'container'))
          parent = getRoot(editor);
        if (!parent) {
          const insertedSection = commitEditorCommand(editor, {
            kind: 'insert',
            definition: createBlockDefinition('section'),
          });
          parent = insertedSection ? getSelectedComponent(editor) : undefined;
        }
        if (!parent) return false;
        return commitEditorCommand(editor, {
          kind: 'insert',
          definition,
          parentId: payloadNodeId(parent),
        });
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
    let disposed = false;
    let editor: Editor | null = null;
    let unbindCanvasComponentDrag: (() => void) | undefined;
    let unbindRuntimePreviewClasses: (() => void) | undefined;
    let bindCanvasComponentDragWhenReady: (() => void) | undefined;
    let unbindCanvasStateObservers: (() => void) | undefined;
    let bindCanvasStateObservers: (() => void) | undefined;

    const isTypingTarget = (
      target: EventTarget | null,
      currentEditor: Editor | null,
    ): boolean => {
      const element = target as HTMLElement | null;
      return Boolean(
        element &&
        (element.tagName === 'INPUT' ||
          element.tagName === 'TEXTAREA' ||
          element.tagName === 'SELECT' ||
          (element.isContentEditable && Boolean(currentEditor?.getEditing?.()))),
      );
    };
    const handleInteractionKeyDown = (event: KeyboardEvent) => {
      const currentEditor = editorRef.current;
      if (isTypingTarget(event.target, currentEditor)) return;
      if (event.key === 'Escape') {
        blockDragCleanupRef.current?.();
        callbacksRef.current.onInteractionModeChange('select');
        interactionModeRef.current = 'select';
        if (currentEditor) setCanvasInteractionClass(currentEditor, 'select');
        return;
      }
      if (currentEditor && (event.metaKey || event.ctrlKey)) {
        if (event.key.toLowerCase() === 'z') {
          if (event.shiftKey)
            currentEditor && commitEditorCommand(currentEditor, { kind: 'redo' });
          else commitEditorCommand(currentEditor, { kind: 'undo' });
          event.preventDefault();
          return;
        }
        if (event.key.toLowerCase() === 'y') {
          commitEditorCommand(currentEditor, { kind: 'redo' });
          event.preventDefault();
          return;
        }
        if (event.key.toLowerCase() === 'd') {
          const selected = getSelectedComponent(currentEditor);
          const nodeId = selected && payloadNodeId(selected);
          if (nodeId) commitEditorCommand(currentEditor, { kind: 'duplicate', nodeId });
          event.preventDefault();
          return;
        }
      }
      if (currentEditor && (event.key === 'Delete' || event.key === 'Backspace')) {
        const selected = getSelectedComponent(currentEditor);
        const nodeId = selected && payloadNodeId(selected);
        if (nodeId && selected !== getRoot(currentEditor)) {
          commitEditorCommand(currentEditor, { kind: 'remove', nodeId });
          event.preventDefault();
        }
        return;
      }
      if ((event.key === 'v' || event.key === 'V') && !event.metaKey && !event.ctrlKey) {
        interactionModeRef.current = 'select';
        if (currentEditor) setCanvasInteractionClass(currentEditor, 'select');
        callbacksRef.current.onInteractionModeChange('select');
        return;
      }
      if ((event.key === 'h' || event.key === 'H') && !event.metaKey && !event.ctrlKey) {
        interactionModeRef.current = 'hand';
        if (currentEditor) setCanvasInteractionClass(currentEditor, 'hand');
        callbacksRef.current.onInteractionModeChange('hand');
        return;
      }
      if (event.code === 'Space' && !event.repeat) {
        temporaryPanRef.current = true;
        if (currentEditor)
          setCanvasInteractionClass(currentEditor, interactionModeRef.current, true);
        event.preventDefault();
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
      event.preventDefault();
    };
    const handleInteractionKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      temporaryPanRef.current = false;
      if (editorRef.current)
        setCanvasInteractionClass(editorRef.current, interactionModeRef.current);
    };
    window.addEventListener('keydown', handleInteractionKeyDown);
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
          blockManager: { blocks: createBlockManagerDefinitions(), custom: true },
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
        commandBusRef.current = createEditorCommandBus(editor);
        editor.setComponents(payloadToEditorComponent(payloadRef.current));
        ensureAllFormPreviews(getRoot(editor));
        syncRuntimePreviewClasses(getRoot(editor));
        window.setTimeout(() => syncRuntimePreviewClasses(getRoot(editor as Editor)), 0);
        // The persisted root is an explicit <main> component. Keep GrapesJS'
        // implicit body wrapper out of the editable PagePayloadV1 tree.
        editor.getWrapper()?.set({ droppable: false, selectable: false });
        bindCanvasComponentDragWhenReady = () => {
          unbindCanvasComponentDrag?.();
          unbindRuntimePreviewClasses?.();
          syncRuntimePreviewClasses(getRoot(editor as Editor));
          window.setTimeout(() => {
            if (editorRef.current === editor)
              syncRuntimePreviewClasses(getRoot(editor as Editor));
          }, 50);
          const frameDocument = editor?.Canvas.getFrameEl()?.contentDocument;
          if (frameDocument?.body && typeof MutationObserver !== 'undefined') {
            const observer = new MutationObserver(() => {
              if (editorRef.current === editor)
                syncRuntimePreviewClasses(getRoot(editor as Editor));
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
            getPayload: () => serializeGrapesComponent(getRoot(editor as Editor)),
            setCanvasZoom: (zoom) => (editor as Editor).Canvas.setZoom(zoom),
          };
        }
        const handleComponentUpdate = () => {
          window.setTimeout(() => {
            if (editorRef.current === editor)
              syncRuntimePreviewClasses(getRoot(editor as Editor));
          }, 0);
          if (!internalChangeRef.current) {
            callbacksRef.current.onDirty();
            notifyDocumentChange(editor as Editor);
          }
          notifySelection(editor as Editor);
          notifyHistory(editor as Editor);
          scheduleCanvasState(editor as Editor, true);
        };
        const handleSelectionChange = () => {
          const selected = (editor as Editor).getSelected();
          if (!selected) {
            if (selectingComponentRef.current) return;
            selectionRef.current.clear();
            callbacksRef.current.onSelectionChange(null);
            return;
          }
          selectionRef.current.set(selected);
          callbacksRef.current.onSelectionChange(selectionFromComponent(selected));
        };
        const handleClone = (component: Component) => {
          reassignEditorNodeIds(component as Component);
          callbacksRef.current.onDirty();
          notifySelection(editor as Editor);
          notifyHistory(editor as Editor);
          notifyDocumentChange(editor as Editor);
          scheduleCanvasState(editor as Editor, true);
        };
        const handleComponentDragEnd = () => handleComponentUpdate();
        const handleHistoryChange = () => notifyHistory(editor as Editor);

        editor.on('component:update', handleComponentUpdate);
        editor.on('component:add', handleComponentUpdate);
        editor.on('component:remove', handleComponentUpdate);
        editor.on('component:drag:end', handleComponentDragEnd);
        editor.on('component:styleUpdate', handleComponentUpdate);
        editor.on('component:selected', handleSelectionChange);
        editor.on('component:deselected', handleSelectionChange);
        editor.on('component:clone', handleClone);
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
      window.removeEventListener('keydown', handleInteractionKeyDown);
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
