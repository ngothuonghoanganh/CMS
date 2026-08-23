'use client';

import type { BlockProperties, Component, Editor } from 'grapesjs';
import {
  BUILDER_NODE_ID_ATTRIBUTE,
  BUILDER_NODE_TYPE_ATTRIBUTE,
  BUILDER_FORM_PROPS_ATTRIBUTE,
  BUILDER_TEXT_ALIGN_ATTRIBUTE,
  type BuilderNodeType,
  type BuilderBlockType,
  type BuilderViewport,
  applyEditorViewportStyle,
  canContainNode,
  captureEditorViewportStyle,
  createBlockDefinition,
  formPreviewComponents,
  payloadToEditorComponent,
  readEditorResponsiveStyle,
  reassignEditorNodeIds,
  serializeGrapesComponent,
  updateEditorViewportStyle,
} from './builder-adapter';
import {
  findPayloadComponent,
  isEditorOnlyPreview,
  moveNodeByIntent,
  payloadAncestor,
  payloadNodeId,
  payloadNodeType,
  validateNodeIntent,
  type DropPosition,
  type MoveNodeIntent,
  selectedMoveIntent,
} from './builder-interaction';
import type { BuilderCanvasNode, BuilderCanvasState } from './builder-minimap';
import { forwardRef, useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import {
  FormPropsSchema,
  type FormProps,
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
};

type BuilderDebugApi = {
  getPayload: () => PagePayload;
};

declare global {
  interface Window {
    __payloadBuilderDebug?: BuilderDebugApi;
  }
}

export type GrapesEditorHandle = {
  addBlock: (type: BuilderBlockType) => void;
  startBlockDrag: (type: BuilderBlockType, event: Event) => void;
  duplicateSelected: () => void;
  deleteSelected: () => void;
  undo: () => void;
  redo: () => void;
  serialize: () => PagePayload;
  setViewport: (viewport: BuilderViewport) => void;
  updateSelectedText: (value: string) => void;
  updateSelectedAttribute: (
    name: 'href' | 'target' | 'src' | 'alt',
    value: string,
  ) => void;
  updateSelectedAlign: (value: SelectedBuilderNode['align']) => void;
  updateSelectedStyle: (property: string, value: string) => void;
  updateSelectedForm: (form: FormProps) => void;
  selectAsset: (src: string) => void;
  selectNode: (id: string) => void;
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
  onSelectionChange: (node: SelectedBuilderNode | null) => void;
  onReady: () => void;
  onHistoryChange: (state: { canUndo: boolean; canRedo: boolean }) => void;
  onCanvasStateChange: (state: BuilderCanvasState) => void;
  onInteractionModeChange: (mode: InteractionMode) => void;
  onError: (message: string) => void;
};

const allViewports: BuilderViewport[] = ['desktop', 'tablet', 'mobile'];

function isPayloadNodeType(value: unknown): value is BuilderNodeType {
  return (
    value === 'root' ||
    value === 'section' ||
    value === 'container' ||
    value === 'text' ||
    value === 'image' ||
    value === 'button' ||
    value === 'form'
  );
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
    if (target && !canContainNode(payloadNodeType(target) ?? 'text', sourceType)) {
      const parent = payloadAncestor(target.parent());
      const parentType = parent ? payloadNodeType(parent) : undefined;
      if (
        parent &&
        parentType &&
        parentType !== 'root' &&
        canContainNode(parentType, sourceType)
      ) {
        target = parent;
      } else {
        target = null;
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
  result: ReturnType<typeof moveNodeByIntent> | undefined,
  root: Component,
): void {
  indicator.className = `builder-drop-indicator${result?.valid === false ? ' invalid' : ''}`;
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
  return () => {
    frameDocument.removeEventListener('mousedown', onDown, true);
    frameDocument.removeEventListener('mousemove', onMove, true);
    frameDocument.removeEventListener('mouseup', onUp, true);
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

  const { x, y } = editor.Canvas.getMouseRelativeCanvas({ clientX, clientY });
  const element = frame.contentDocument?.elementFromPoint(x, y);
  if (!element) return undefined;

  const root = editor.getComponents().models[0];
  if (!root) return undefined;
  let target = componentForCanvasElement(root, element);
  while (target) {
    const targetType = target.getAttributes({ noStyle: true })[
      BUILDER_NODE_TYPE_ATTRIBUTE
    ];
    if (
      isPayloadNodeType(targetType) &&
      (canContainNode(targetType, type) ||
        (targetType === 'root' && ['text', 'image', 'button'].includes(type)))
    ) {
      break;
    }
    target = target.parent() ?? null;
  }
  if (!target) return undefined;

  if (target === root && (type === 'text' || type === 'image' || type === 'button')) {
    target = root.append(createBlockDefinition('section'))[0] ?? root;
  }
  const created = target.append(createBlockDefinition(type));
  const added = created[0];
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
    if (isPayloadNodeType(type) && canContainNode(type, childType)) {
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

const blockLabels: Record<BuilderBlockType, string> = {
  section: 'Section',
  container: 'Container',
  text: 'Text',
  image: 'Image',
  button: 'Button',
  form: 'Form',
};

function createBlockManagerDefinitions(): BlockProperties[] {
  return (Object.keys(blockLabels) as BuilderBlockType[]).map((type) => ({
    category: 'PagePayloadV1',
    content: () => createBlockDefinition(type),
    id: type,
    label: blockLabels[type],
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
  const blockDragCleanupRef = useRef<(() => void) | null>(null);
  const lastSelectedComponentRef = useRef<Component | null>(null);
  const viewportRef = useRef<BuilderViewport>('desktop');
  const internalChangeRef = useRef(false);
  const canvasStateFrameRef = useRef<number | null>(null);
  const canvasGeometryRef = useRef<BuilderCanvasGeometry | null>(null);
  const canvasGeometryPendingRef = useRef(true);
  const callbacksRef = useRef({
    onDirty,
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
    const selected = editor.getSelected() ?? lastSelectedComponentRef.current;
    if (!selected && internalChangeRef.current) return;
    callbacksRef.current.onSelectionChange(selectionFromComponent(selected ?? undefined));
  }

  function getSelectedComponent(editor: Editor): Component | undefined {
    const selected = editor.getSelected();
    if (selected) lastSelectedComponentRef.current = selected;
    return selected ?? lastSelectedComponentRef.current ?? undefined;
  }

  function notifyHistory(editor: Editor): void {
    callbacksRef.current.onHistoryChange({
      canRedo: editor.UndoManager.hasRedo(),
      canUndo: editor.UndoManager.hasUndo(),
    });
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
    const result = moveNodeByIntent(getRoot(editor), intent);
    if (!result.valid) return false;
    editor.select(result.source);
    lastSelectedComponentRef.current = result.source;
    callbacksRef.current.onDirty();
    notifySelection(editor);
    notifyHistory(editor);
    scheduleCanvasState(editor, true);
    return true;
  }

  useImperativeHandle(
    ref,
    () => ({
      addBlock(type) {
        const editor = editorRef.current;
        if (!editor) return;
        const definition = createBlockDefinition(type);
        const selected = editor.getSelected();
        const selectedType = selected?.getAttributes({ noStyle: true })[
          BUILDER_NODE_TYPE_ATTRIBUTE
        ];
        const target =
          selected &&
          isPayloadNodeType(selectedType) &&
          canContainNode(selectedType, type)
            ? selected
            : findAppendTarget(getRoot(editor), type);

        let created: Component[];
        if (target) {
          created = target.append(definition);
        } else if (type === 'section' || type === 'container') {
          created = getRoot(editor).append(definition);
        } else {
          const section = getRoot(editor).append(createBlockDefinition('section'))[0];
          if (!section) {
            throw new Error('Could not create a section for the new block');
          }
          created = section.append(definition);
        }
        const added = created[0];
        if (added) {
          if (type === 'form') ensureFormPreview(added);
          editor.select(added);
          lastSelectedComponentRef.current = added;
        }
        callbacksRef.current.onDirty();
        notifySelection(editor);
        notifyHistory(editor);
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
        editor.runCommand('tlb-clone');
        callbacksRef.current.onDirty();
        notifySelection(editor);
        notifyHistory(editor);
      },
      deleteSelected() {
        const editor = editorRef.current;
        const selected = editor ? getSelectedComponent(editor) : undefined;
        if (!editor || !selected || selected === getRoot(editor)) return;
        editor.runCommand('core:component-delete');
        callbacksRef.current.onDirty();
        callbacksRef.current.onSelectionChange(
          selectionFromComponent(editor.getSelected()),
        );
        notifyHistory(editor);
      },
      undo() {
        const editor = editorRef.current;
        if (!editor || !editor.UndoManager.hasUndo()) return;
        editor.runCommand('core:undo');
        callbacksRef.current.onDirty();
        notifySelection(editor);
        notifyHistory(editor);
      },
      redo() {
        const editor = editorRef.current;
        if (!editor || !editor.UndoManager.hasRedo()) return;
        editor.runCommand('core:redo');
        callbacksRef.current.onDirty();
        notifySelection(editor);
        notifyHistory(editor);
      },
      updateSelectedForm(form) {
        const editor = editorRef.current;
        const selected = editor ? getSelectedComponent(editor) : undefined;
        if (!editor || !selected) return;
        const type = selected.getAttributes({ noStyle: true })[
          BUILDER_NODE_TYPE_ATTRIBUTE
        ];
        if (type !== 'form') return;
        selected.setAttributes({
          ...selected.getAttributes({ noStyle: true }),
          [BUILDER_FORM_PROPS_ATTRIBUTE]: JSON.stringify(form),
        });
        selected.components(formPreviewComponents(form));
        callbacksRef.current.onDirty();
        notifySelection(editor);
        notifyHistory(editor);
      },
      serialize() {
        const editor = editorRef.current;
        if (!editor) {
          throw new Error('Builder editor is not ready');
        }
        const root = getRoot(editor);
        captureAllViewportStyles(root, viewportRef.current);
        return serializeGrapesComponent(root);
      },
      setViewport(viewport) {
        const editor = editorRef.current;
        if (!editor || viewport === viewportRef.current) return;
        const root = getRoot(editor);
        const selected = getSelectedComponent(editor);
        const selectedSnapshot = selectionFromComponent(selected);
        internalChangeRef.current = true;
        captureAllViewportStyles(root, viewportRef.current);
        applyAllViewportStyles(root, viewport);
        editor.setDevice(viewport);
        viewportRef.current = viewport;
        callbacksRef.current.onSelectionChange(selectedSnapshot);
        const restoreSelection = () => {
          if (selected && editorRef.current === editor) {
            editor.select(selected);
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
        selected.set('content', value);
        callbacksRef.current.onDirty();
        callbacksRef.current.onSelectionChange(selectionFromComponent(selected));
      },
      updateSelectedAttribute(name, value) {
        const editor = editorRef.current;
        if (!editor) return;
        const selected = getSelectedComponent(editor);
        if (!selected) return;
        selected.setAttributes({
          ...selected.getAttributes({ noStyle: true }),
          [name]: value,
        });
        callbacksRef.current.onDirty();
        callbacksRef.current.onSelectionChange(selectionFromComponent(selected));
      },
      updateSelectedAlign(value) {
        const editor = editorRef.current;
        if (!editor) return;
        const selected = getSelectedComponent(editor);
        if (!selected || !value) return;
        selected.setAttributes({
          ...selected.getAttributes({ noStyle: true }),
          [BUILDER_TEXT_ALIGN_ATTRIBUTE]: value,
        });
        callbacksRef.current.onDirty();
        callbacksRef.current.onSelectionChange(selectionFromComponent(selected));
      },
      updateSelectedStyle(property, value) {
        const editor = editorRef.current;
        if (!editor) return;
        const selected = getSelectedComponent(editor);
        if (!selected) return;
        internalChangeRef.current = true;
        updateEditorViewportStyle(selected, viewportRef.current, property, value);
        callbacksRef.current.onDirty();
        callbacksRef.current.onSelectionChange(selectionFromComponent(selected));
        queueMicrotask(() => {
          internalChangeRef.current = false;
        });
      },
      selectAsset(src) {
        const editor = editorRef.current;
        if (!editor) return;
        const selected = getSelectedComponent(editor);
        if (!selected) return;
        selected.setAttributes({
          ...selected.getAttributes({ noStyle: true }),
          src,
        });
        callbacksRef.current.onDirty();
        callbacksRef.current.onSelectionChange(selectionFromComponent(selected));
      },
      selectNode(id) {
        const editor = editorRef.current;
        if (!editor) return;
        const component = findComponentById(getRoot(editor), id);
        if (!component) return;
        editor.select(component);
        lastSelectedComponentRef.current = component;
        editor.Canvas.scrollTo(component, {
          behavior: 'auto',
          block: 'center',
        });
        notifySelection(editor);
        scheduleCanvasState(editor);
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
    }),
    [],
  );

  useEffect(() => {
    let disposed = false;
    let editor: Editor | null = null;
    let unbindCanvasComponentDrag: (() => void) | undefined;
    let bindCanvasComponentDragWhenReady: (() => void) | undefined;
    let unbindCanvasStateObservers: (() => void) | undefined;
    let bindCanvasStateObservers: (() => void) | undefined;

    const isTypingTarget = (target: EventTarget | null): boolean => {
      const element = target as HTMLElement | null;
      return Boolean(
        element &&
        (element.isContentEditable ||
          element.tagName === 'INPUT' ||
          element.tagName === 'TEXTAREA' ||
          element.tagName === 'SELECT'),
      );
    };
    const handleInteractionKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const currentEditor = editorRef.current;
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
            *, *::before, *::after { box-sizing: border-box; }
            html, body { min-height: 100%; }
            body { margin: 0; padding: 24px; background: #ffffff; color: #172033; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
            main[data-payload-node-type="root"] { min-height: calc(100vh - 48px); }
            img[data-payload-node-type="image"] { display: block; max-width: 100%; height: auto; }
            a[data-payload-node-type="button"] { display: inline-block; color: inherit; text-decoration: none; }
            form[data-payload-node-type="form"] {
              display: flex;
              flex-direction: column;
              gap: 16px;
              width: min(100%, 520px);
              margin: 0;
              padding: 24px;
              border: 1px solid #d8dee9;
              border-radius: 12px;
              background: #ffffff;
              box-shadow: 0 8px 24px #17203312;
            }
            form[data-payload-node-type="form"] [data-payload-form-preview="field"] {
              display: grid;
              gap: 7px;
              color: #172033;
              font-size: 14px;
              font-weight: 600;
            }
            form[data-payload-node-type="form"] [data-payload-form-preview="field"] > input,
            form[data-payload-node-type="form"] [data-payload-form-preview="field"] > textarea,
            form[data-payload-node-type="form"] [data-payload-form-preview="field"] > select,
            form[data-payload-node-type="form"] [data-payload-form-preview="control"] {
              width: 100%;
              min-height: 40px;
              padding: 9px 11px;
              border: 1px solid #c7cfdb;
              border-radius: 8px;
              background: #ffffff;
              color: #172033;
              font: inherit;
              font-weight: 400;
            }
            form[data-payload-node-type="form"] textarea[data-payload-form-preview="control"] {
              min-height: 88px;
              resize: none;
            }
            form[data-payload-node-type="form"] fieldset[data-payload-form-preview="field"] {
              min-width: 0;
              margin: 0;
              padding: 0;
              border: 0;
            }
            form[data-payload-node-type="form"] fieldset[data-payload-form-preview="field"] > div {
              display: grid;
              gap: 8px;
              font-weight: 400;
            }
            form[data-payload-node-type="form"] [data-payload-form-preview="option"] {
              display: flex;
              align-items: center;
              gap: 8px;
              font-weight: 400;
            }
            form[data-payload-node-type="form"] [data-payload-form-preview="option"] input {
              width: auto;
              min-height: auto;
            }
            form[data-payload-node-type="form"] > [data-payload-form-preview="submit"] {
              align-self: flex-start;
              min-height: 40px;
              padding: 9px 16px;
              border: 0;
              border-radius: 8px;
              background: #172033;
              color: #ffffff;
              font: inherit;
              font-weight: 700;
            }
            form[data-payload-node-type="form"] [data-payload-form-preview] {
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
              { id: 'desktop', name: 'Desktop', width: '' },
              { id: 'tablet', name: 'Tablet', width: '640px', widthMedia: '768px' },
              { id: 'mobile', name: 'Mobile', width: '375px', widthMedia: '480px' },
            ],
          },
        });
        editorRef.current = editor;
        editor.setComponents(payloadToEditorComponent(payloadRef.current));
        ensureAllFormPreviews(getRoot(editor));
        // The persisted root is an explicit <main> component. Keep GrapesJS'
        // implicit body wrapper out of the editable PagePayloadV1 tree.
        editor.getWrapper()?.set({ droppable: false, selectable: false });
        bindCanvasComponentDragWhenReady = () => {
          unbindCanvasComponentDrag?.();
          unbindCanvasComponentDrag = bindCanvasComponentDrag(
            editor as Editor,
            interactionModeRef,
            temporaryPanRef,
            (intent) => commitStructuralMove(editor as Editor, intent),
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
          };
        }
        const handleComponentUpdate = () => {
          if (!internalChangeRef.current) {
            callbacksRef.current.onDirty();
          }
          notifySelection(editor as Editor);
          notifyHistory(editor as Editor);
          scheduleCanvasState(editor as Editor, true);
        };
        const handleSelectionChange = () => {
          const selected = (editor as Editor).getSelected();
          if (!selected) {
            lastSelectedComponentRef.current = null;
            callbacksRef.current.onSelectionChange(null);
            return;
          }
          lastSelectedComponentRef.current = selected;
          callbacksRef.current.onSelectionChange(selectionFromComponent(selected));
        };
        const handleClone = (component: Component) => {
          reassignEditorNodeIds(component as Component);
          callbacksRef.current.onDirty();
          notifySelection(editor as Editor);
          notifyHistory(editor as Editor);
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
