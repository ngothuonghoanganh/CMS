'use client';

import {
  AssetListResponseSchema,
  LandingPageSchema,
  FormPropsSchema,
  PagePayloadSchema,
  PageVersionListResponseSchema,
  PageVersionSchema,
  type Asset,
  type FormField,
  type FormProps,
  type LandingPage,
  type PagePayload,
  type PageVersion,
} from '@payload/contracts';
import { useRouter } from 'next/navigation';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

import { ApiClientError, api } from '../app/lib/api';
import {
  BUILDER_VIEWPORTS,
  GrapesEditor,
  type GrapesEditorHandle,
  type InteractionMode,
  type SelectedBuilderNode,
} from './grapes-editor';
import {
  PageMinimap,
  type BuilderCanvasNode,
  type BuilderCanvasState,
} from './builder-minimap';
import type {
  BuilderBlockType,
  BuilderNodeType,
  BuilderViewport,
} from './builder-adapter';
import type { DropPosition, MoveNodeIntent } from './builder-interaction';

type BuilderShellProps = {
  workspaceId: string;
  siteId: string;
  pageId: string;
};

type LoadState = 'loading' | 'ready' | 'error';
type SaveStatus = 'initializing' | 'saved' | 'unsaved' | 'saving' | 'error' | 'conflict';

const blockOptions: Array<{ type: BuilderBlockType; label: string }> = [
  { type: 'section', label: 'Section' },
  { type: 'container', label: 'Container' },
  { type: 'text', label: 'Text' },
  { type: 'image', label: 'Image' },
  { type: 'button', label: 'Button' },
  { type: 'form', label: 'Form' },
];

type InspectorNodeType = BuilderNodeType;
type InspectorSectionKey =
  'content' | 'layout' | 'spacing' | 'typography' | 'appearance' | 'advanced';

type InspectorStyleField = {
  property: string;
  label: string;
  placeholder?: string;
  appliesTo?: readonly InspectorNodeType[];
};

type InspectorStyleSection = {
  key: Exclude<InspectorSectionKey, 'content' | 'advanced'>;
  label: string;
  fields: readonly InspectorStyleField[];
};

const allInspectorNodeTypes: readonly InspectorNodeType[] = [
  'root',
  'section',
  'container',
  'text',
  'image',
  'button',
  'form',
];

const inspectorStyleSections: readonly InspectorStyleSection[] = [
  {
    key: 'layout',
    label: 'Layout',
    fields: [
      { property: 'display', label: 'Display', placeholder: 'block, flex or grid' },
      {
        property: 'width',
        label: 'Width',
        placeholder: 'Auto, 320px or 100%',
      },
      {
        property: 'max-width',
        label: 'Max width',
        placeholder: 'None or 1200px',
      },
      {
        property: 'min-height',
        label: 'Min height',
        placeholder: 'Auto or 480px',
      },
      {
        property: 'gap',
        label: 'Gap',
        placeholder: 'e.g. 24px',
        appliesTo: ['root', 'section', 'container'],
      },
    ],
  },
  {
    key: 'spacing',
    label: 'Spacing',
    fields: [
      { property: 'padding', label: 'Padding', placeholder: 'e.g. 24px 16px' },
      { property: 'margin', label: 'Margin', placeholder: 'e.g. 0 auto' },
    ],
  },
  {
    key: 'typography',
    label: 'Typography',
    fields: [
      {
        property: 'color',
        label: 'Text color',
        placeholder: '#172033 or transparent',
        appliesTo: ['root', 'section', 'container', 'text', 'button'],
      },
      {
        property: 'font-size',
        label: 'Font size',
        placeholder: 'e.g. 16px',
        appliesTo: ['root', 'section', 'container', 'text', 'button'],
      },
      {
        property: 'font-weight',
        label: 'Font weight',
        placeholder: '400, 500, 600, 700 or 800',
        appliesTo: ['root', 'section', 'container', 'text', 'button'],
      },
      {
        property: 'text-align',
        label: 'Text alignment',
        placeholder: 'left, center or right',
        appliesTo: ['root', 'section', 'container', 'button'],
      },
    ],
  },
  {
    key: 'appearance',
    label: 'Appearance',
    fields: [
      {
        property: 'background-color',
        label: 'Background',
        placeholder: '#fef3c7 or transparent',
        appliesTo: allInspectorNodeTypes,
      },
      {
        property: 'border-radius',
        label: 'Radius',
        placeholder: 'e.g. 12px',
        appliesTo: allInspectorNodeTypes,
      },
    ],
  },
];

const alignmentOptions = [
  { value: 'left' as const, label: 'Left', icon: '⇤' },
  { value: 'center' as const, label: 'Center', icon: '↔' },
  { value: 'right' as const, label: 'Right', icon: '⇥' },
];

function viewportStyleKey(viewport: BuilderViewport): 'base' | 'tablet' | 'mobile' {
  return viewport === 'desktop' ? 'base' : viewport;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }
  return error instanceof Error ? error.message : 'The builder could not load this page.';
}

function isUsableImageSource(value: string): boolean {
  return value.startsWith('/assets/') || /^https?:\/\//i.test(value);
}

function renderLayerNodes(
  nodes: BuilderCanvasNode[],
  parentId: string | undefined,
  selectedId: string | undefined,
  onSelect: (id: string) => void,
  onToggle: (id: string) => void,
  onDragStart: (
    node: BuilderCanvasNode,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void,
  collapsedIds: Set<string>,
  draggingId: string | null,
  dropIntent: MoveNodeIntent | null,
): ReactNode {
  return nodes
    .filter((node) => node.parentId === parentId)
    .map((node) => {
      const hasChildren = nodes.some((child) => child.parentId === node.id);
      const children =
        hasChildren && !collapsedIds.has(node.id)
          ? renderLayerNodes(
              nodes,
              node.id,
              selectedId,
              onSelect,
              onToggle,
              onDragStart,
              collapsedIds,
              draggingId,
              dropIntent,
            )
          : null;
      const dropClass =
        dropIntent?.targetNodeId === node.id ? ` drop-${dropIntent.position}` : '';
      return (
        <div
          className={`builder-layer-node${draggingId === node.id ? ' dragging' : ''}${dropClass}`}
          data-builder-layer-row-id={node.id}
          key={node.id}
        >
          <div className="builder-layer-row">
            <button
              aria-label={`${collapsedIds.has(node.id) ? 'Expand' : 'Collapse'} ${node.label}`}
              className="builder-layer-toggle"
              disabled={!hasChildren}
              onClick={() => onToggle(node.id)}
              type="button"
            >
              {hasChildren ? (collapsedIds.has(node.id) ? '▸' : '▾') : '·'}
            </button>
            <button
              aria-label={`Drag ${node.label} layer`}
              className="builder-layer-drag-handle"
              onPointerDown={(event) => onDragStart(node, event)}
              type="button"
            >
              ⠿
            </button>
            <button
              aria-label={`Select ${node.label}`}
              aria-selected={node.id === selectedId}
              className={`builder-layer-button${node.id === selectedId ? ' selected' : ''}`}
              data-builder-layer-id={node.id}
              onClick={() => onSelect(node.id)}
              role="treeitem"
              type="button"
            >
              <span
                aria-hidden="true"
                className="builder-layer-indent"
                style={{ width: node.depth * 12 }}
              />
              <span className="builder-layer-icon" aria-hidden="true">
                {node.type === 'root' ? '▣' : node.type === 'section' ? '▤' : '▪'}
              </span>
              <span className="builder-layer-label">{node.label}</span>
            </button>
          </div>
          {children ? <div className="builder-layer-children">{children}</div> : null}
        </div>
      );
    });
}

function inspectorNodeLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function inspectorNodeSummary(selected: SelectedBuilderNode): string {
  if (selected.type === 'text') {
    return selected.text?.trim() || 'Text element';
  }
  if (selected.type === 'button') {
    return selected.label?.trim() || 'Button element';
  }
  if (selected.type === 'image') {
    return selected.alt?.trim() || 'Image element';
  }
  return `${inspectorNodeLabel(selected.type)} element`;
}

function layerPath(nodes: BuilderCanvasNode[], selectedId: string): BuilderCanvasNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const result: BuilderCanvasNode[] = [];
  let current = byId.get(selectedId);
  while (current) {
    result.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return result;
}

function InspectorSection({
  children,
  label,
  onToggle,
  open,
}: {
  children: ReactNode;
  label: string;
  onToggle: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <details
      className="builder-inspector-section"
      onToggle={(event) => onToggle(event.currentTarget.open)}
      open={open}
    >
      <summary>{label}</summary>
      <div className="builder-inspector-section-body">{children}</div>
    </details>
  );
}

export default function BuilderShell({ workspaceId, siteId, pageId }: BuilderShellProps) {
  const router = useRouter();
  const editorRef = useRef<GrapesEditorHandle>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('initializing');
  const [page, setPage] = useState<LandingPage | null>(null);
  const [version, setVersion] = useState<PageVersion | null>(null);
  const [payload, setPayload] = useState<PagePayload | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selected, setSelected] = useState<SelectedBuilderNode | null>(null);
  const [canvasState, setCanvasState] = useState<BuilderCanvasState | null>(null);
  const [viewport, setViewport] = useState<BuilderViewport>('desktop');
  const [openInspectorSections, setOpenInspectorSections] = useState<
    Record<InspectorSectionKey, boolean>
  >({
    content: true,
    layout: true,
    spacing: false,
    typography: false,
    appearance: false,
    advanced: false,
  });
  const viewportChangingRef = useRef(false);
  const selectedNodeRef = useRef<SelectedBuilderNode | null>(null);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('select');
  const [collapsedLayerIds, setCollapsedLayerIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [layerDraggingId, setLayerDraggingId] = useState<string | null>(null);
  const [layerDropIntent, setLayerDropIntent] = useState<MoveNodeIntent | null>(null);
  const layerTreeRef = useRef<HTMLDivElement>(null);
  const layerPointerCleanupRef = useRef<(() => void) | null>(null);
  const layerHoverExpandTimerRef = useRef<number | null>(null);
  const layerHoverExpandTargetRef = useRef<string | null>(null);

  const isDirty = saveStatus === 'unsaved' || saveStatus === 'saving';
  const styleBlock = selected?.style?.[viewportStyleKey(viewport)] ?? {};
  const usableAssets = useMemo(
    () => assets.filter((asset) => isUsableImageSource(asset.storageKey)),
    [assets],
  );

  function toggleLayer(id: string) {
    setCollapsedLayerIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateLayerDropIntent(
    event: PointerEvent,
    sourceId: string,
    previous: MoveNodeIntent | null,
  ): MoveNodeIntent | null {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const row = element?.closest<HTMLElement>('[data-builder-layer-row-id]');
    const targetId = row?.dataset.builderLayerRowId;
    const button = row?.querySelector<HTMLElement>('.builder-layer-button');
    if (!targetId || !button) return null;
    const rect = button.getBoundingClientRect();
    const edge = Math.max(12, Math.min(24, rect.height * 0.3));
    let position: DropPosition = 'inside';
    if (event.clientY - rect.top < edge) position = 'before';
    else if (rect.bottom - event.clientY < edge) position = 'after';
    if (previous?.targetNodeId === targetId && previous.position !== position) {
      const hysteresis = 3;
      if (
        previous.position === 'before' &&
        event.clientY - rect.top < edge + hysteresis &&
        rect.bottom - event.clientY > edge - hysteresis
      )
        position = previous.position;
      if (
        previous.position === 'after' &&
        rect.bottom - event.clientY < edge + hysteresis &&
        event.clientY - rect.top > edge - hysteresis
      )
        position = previous.position;
    }
    const target = canvasState?.nodes.find((node) => node.id === targetId);
    const collapsedParentId =
      target &&
      canvasState?.nodes.some((node) => node.parentId === target.id) &&
      collapsedLayerIds.has(target.id)
        ? target.id
        : null;
    if (layerHoverExpandTargetRef.current !== collapsedParentId) {
      if (layerHoverExpandTimerRef.current !== null) {
        window.clearTimeout(layerHoverExpandTimerRef.current);
        layerHoverExpandTimerRef.current = null;
      }
      layerHoverExpandTargetRef.current = collapsedParentId;
      if (collapsedParentId) {
        layerHoverExpandTimerRef.current = window.setTimeout(() => {
          setCollapsedLayerIds((current) => {
            const next = new Set(current);
            next.delete(collapsedParentId);
            return next;
          });
          layerHoverExpandTimerRef.current = null;
          layerHoverExpandTargetRef.current = null;
        }, 500);
      }
    }
    return { nodeId: sourceId, targetNodeId: targetId, position };
  }

  function startLayerDrag(
    node: BuilderCanvasNode,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    layerPointerCleanupRef.current?.();
    const state = {
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      intent: null as MoveNodeIntent | null,
    };
    setLayerDraggingId(node.id);
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('mouseup', onMouseUp, true);
      if (layerHoverExpandTimerRef.current !== null) {
        window.clearTimeout(layerHoverExpandTimerRef.current);
        layerHoverExpandTimerRef.current = null;
      }
      layerHoverExpandTargetRef.current = null;
      layerPointerCleanupRef.current = null;
      setLayerDraggingId(null);
      setLayerDropIntent(null);
    };
    const onMove = (moveEvent: PointerEvent) => {
      const distance = Math.hypot(
        moveEvent.clientX - state.startX,
        moveEvent.clientY - state.startY,
      );
      if (!state.dragging && distance < 4) return;
      state.dragging = true;
      state.intent = updateLayerDropIntent(moveEvent, node.id, state.intent);
      setLayerDropIntent(state.intent);
      const tree = layerTreeRef.current;
      if (tree) {
        const treeRect = tree.getBoundingClientRect();
        if (moveEvent.clientY < treeRect.top + 36) tree.scrollBy(0, -10);
        else if (moveEvent.clientY > treeRect.bottom - 36) tree.scrollBy(0, 10);
      }
      moveEvent.preventDefault();
    };
    const onUp = (upEvent: PointerEvent) => {
      if (state.dragging) {
        const intent = state.intent ?? updateLayerDropIntent(upEvent, node.id, null);
        if (intent) editorRef.current?.moveNode(intent);
      } else {
        editorRef.current?.selectNode(node.id);
      }
      cleanup();
    };
    const onMouseUp = (upEvent: MouseEvent) => {
      onUp(upEvent as unknown as PointerEvent);
    };
    layerPointerCleanupRef.current = cleanup;
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('mouseup', onMouseUp, true);
  }

  useEffect(() => {
    return () => {
      layerPointerCleanupRef.current?.();
      if (layerHoverExpandTimerRef.current !== null) {
        window.clearTimeout(layerHoverExpandTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadBuilder() {
      setLoadState('loading');
      setError(null);
      try {
        const [pageResponse, versionsResponse, assetsResponse] = await Promise.all([
          api.get(`/pages/${pageId}`),
          api.get(`/pages/${pageId}/versions?limit=100`),
          api.get(`/workspaces/${workspaceId}/assets?limit=100`),
        ]);
        if (cancelled) return;

        const nextPage = LandingPageSchema.parse(pageResponse);
        if (nextPage.siteId !== siteId || nextPage.workspaceId !== workspaceId) {
          throw new Error(
            'This landing page does not belong to the selected workspace/site.',
          );
        }
        const versionList = PageVersionListResponseSchema.parse(versionsResponse);
        const nextVersion =
          versionList.items.find((item) => item.id === nextPage.currentDraftVersionId) ??
          versionList.items[0];
        if (!nextVersion) {
          throw new Error('This landing page does not have a current draft version.');
        }
        const nextPayload = PagePayloadSchema.parse(nextVersion.payload);
        setPage(nextPage);
        setVersion(PageVersionSchema.parse(nextVersion));
        setPayload(nextPayload);
        setAssets(AssetListResponseSchema.parse(assetsResponse).items);
        setLoadState('ready');
        setSaveStatus('saved');
      } catch (caughtError) {
        if (cancelled) return;
        if (caughtError instanceof ApiClientError && caughtError.status === 401) {
          router.replace('/login');
          return;
        }
        setLoadState('error');
        setSaveStatus('error');
        setError(toErrorMessage(caughtError));
      }
    }

    void loadBuilder();
    return () => {
      cancelled = true;
    };
  }, [pageId, router, workspaceId]);

  useEffect(() => {
    function protectUnsavedNavigation(event: BeforeUnloadEvent) {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', protectUnsavedNavigation);
    return () => window.removeEventListener('beforeunload', protectUnsavedNavigation);
  }, [isDirty]);

  function leaveBuilder() {
    if (isDirty && !window.confirm('You have unsaved changes. Leave the builder?')) {
      return;
    }
    router.push('/');
  }

  function markDirty() {
    setNotice(null);
    setSaveStatus('unsaved');
  }

  async function saveDraft() {
    if (!version || !editorRef.current) return;
    setSaveStatus('saving');
    setError(null);
    setNotice(null);
    try {
      const nextPayload = PagePayloadSchema.parse(editorRef.current.serialize());
      const nextVersion = PageVersionSchema.parse(
        await api.post(`/pages/${pageId}/versions`, {
          expectedVersionNumber: version.versionNumber,
          payload: nextPayload,
        }),
      );
      setVersion(nextVersion);
      setSaveStatus('saved');
      setNotice(`Saved draft version ${nextVersion.versionNumber}.`);
    } catch (caughtError) {
      if (caughtError instanceof ApiClientError && caughtError.status === 409) {
        setSaveStatus('conflict');
        setError(
          'This draft was changed elsewhere. Reload the latest draft before saving again.',
        );
        return;
      }
      setSaveStatus('error');
      setError(toErrorMessage(caughtError));
    }
  }

  function reloadLatestDraft() {
    window.location.reload();
  }

  function changeViewport(nextViewport: BuilderViewport) {
    viewportChangingRef.current = true;
    editorRef.current?.setViewport(nextViewport);
    setViewport(nextViewport);
    window.setTimeout(() => {
      viewportChangingRef.current = false;
    }, 1_000);
  }

  function updateSelectedText(event: ChangeEvent<HTMLTextAreaElement>) {
    editorRef.current?.updateSelectedText(event.target.value);
  }

  function updateSelectedAttribute(
    name: 'href' | 'target' | 'src' | 'alt',
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) {
    editorRef.current?.updateSelectedAttribute(name, event.target.value);
  }

  function updateSelectedStyle(property: string, event: ChangeEvent<HTMLInputElement>) {
    editorRef.current?.updateSelectedStyle(property, event.target.value);
  }

  function updateForm(nextForm: FormProps) {
    const parsed = FormPropsSchema.safeParse(nextForm);
    if (parsed.success) {
      editorRef.current?.updateSelectedForm(parsed.data);
    }
  }

  function patchFormField(index: number, patch: Record<string, unknown>) {
    const form = selected?.form;
    if (!form) return;
    const fields = form.fields.map((field, fieldIndex) =>
      fieldIndex === index ? { ...field, ...patch } : field,
    );
    updateForm({ ...form, fields });
  }

  function addFormField() {
    const form = selected?.form;
    if (!form || form.fields.length >= 20) return;
    const id = `field-${Date.now().toString(36)}`;
    const field: FormField = {
      id,
      type: 'text',
      label: 'New field',
      name: id,
      required: false,
      placeholder: '',
    };
    updateForm({ ...form, fields: [...form.fields, field] });
  }

  function moveFormField(index: number, direction: -1 | 1) {
    const form = selected?.form;
    if (!form) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= form.fields.length) return;
    const fields = [...form.fields];
    const current = fields[index];
    const target = fields[nextIndex];
    if (!current || !target) return;
    fields[index] = target;
    fields[nextIndex] = current;
    updateForm({ ...form, fields });
  }

  function removeFormField(index: number) {
    const form = selected?.form;
    if (!form || form.fields.length <= 1) return;
    updateForm({
      ...form,
      fields: form.fields.filter((_, fieldIndex) => fieldIndex !== index),
    });
  }

  function changeFormFieldType(index: number, type: FormField['type']) {
    const field = selected?.form?.fields[index];
    if (!field) return;
    const common = {
      id: field.id,
      label: field.label,
      name: field.name,
      required: field.required,
      type,
    } as Record<string, unknown>;
    if (type !== 'checkbox' && type !== 'radio') {
      common.placeholder = 'Optional';
    }
    if (type === 'select' || type === 'radio') {
      common.options = [{ value: 'option', label: 'Option' }];
    }
    patchFormField(index, common);
  }

  function toggleInspectorSection(section: InspectorSectionKey, open: boolean) {
    setOpenInspectorSections((current) => ({ ...current, [section]: open }));
  }

  function renderStyleSection(
    section: InspectorStyleSection,
    styleBlock: Record<string, string | undefined>,
  ) {
    const fields = section.fields.filter(
      (field) =>
        !field.appliesTo || (selected && field.appliesTo.includes(selected.type)),
    );
    if (fields.length === 0) return null;

    return (
      <InspectorSection
        key={section.key}
        label={section.label}
        onToggle={(open) => toggleInspectorSection(section.key, open)}
        open={openInspectorSections[section.key]}
      >
        <div className="builder-inspector-fields">
          {fields.map((option) => (
            <label key={option.property}>
              {option.label}
              <input
                aria-label={option.label}
                onChange={(event) => updateSelectedStyle(option.property, event)}
                placeholder={option.placeholder ?? 'Not set'}
                value={styleValue(styleBlock, option.property)}
              />
            </label>
          ))}
        </div>
      </InspectorSection>
    );
  }

  if (loadState === 'loading' || !payload || !page || !version) {
    return (
      <main className="builder-loading" aria-busy="true">
        <span className="eyebrow">Visual builder</span>
        <h1>Loading draft…</h1>
        <p className="muted">Preparing the current PagePayloadV1 snapshot.</p>
      </main>
    );
  }

  if (loadState === 'error') {
    return (
      <main className="builder-loading">
        <span className="eyebrow">Visual builder</span>
        <h1>Builder unavailable</h1>
        <p className="alert alert-error" role="alert">
          {error ?? 'The builder could not load this page.'}
        </p>
        <button
          className="button button-ghost"
          onClick={() => window.location.reload()}
          type="button"
        >
          Try again
        </button>
      </main>
    );
  }

  return (
    <main className="builder-frame">
      <header className="builder-topbar">
        <div className="builder-title">
          <button className="button button-ghost" onClick={leaveBuilder} type="button">
            ← Pages
          </button>
          <div>
            <span className="eyebrow">Visual builder</span>
            <h1>{page.name}</h1>
          </div>
        </div>
        <div className="builder-actions">
          <span className={`builder-save-status status-${saveStatus}`} role="status">
            {saveStatus === 'initializing'
              ? 'Initializing editor…'
              : saveStatus === 'saving'
                ? 'Saving…'
                : saveStatus === 'saved'
                  ? `Saved · v${version.versionNumber}`
                  : saveStatus === 'conflict'
                    ? 'Conflict'
                    : saveStatus === 'error'
                      ? 'Save failed'
                      : 'Unsaved changes'}
          </span>
          {saveStatus === 'conflict' ? (
            <button
              className="button button-ghost"
              onClick={reloadLatestDraft}
              type="button"
            >
              Reload latest
            </button>
          ) : null}
          <button
            aria-label="Undo"
            className="button button-small button-ghost"
            disabled={!history.canUndo}
            onClick={() => editorRef.current?.undo()}
            type="button"
          >
            Undo
          </button>
          <button
            aria-label="Redo"
            className="button button-small button-ghost"
            disabled={!history.canRedo}
            onClick={() => editorRef.current?.redo()}
            type="button"
          >
            Redo
          </button>
          <button
            className="button button-primary"
            disabled={saveStatus === 'saving' || saveStatus === 'initializing'}
            onClick={() => void saveDraft()}
            type="button"
          >
            Save draft
          </button>
        </div>
      </header>

      {error ? (
        <div className="builder-alert alert-error" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="builder-alert alert-success" role="status">
          {notice}
        </div>
      ) : null}

      <div className="builder-workspace">
        <aside className="builder-panel builder-blocks-panel">
          <div className="builder-panel-heading">
            <span className="eyebrow">Blocks</span>
            <strong>Add to canvas</strong>
          </div>
          <div className="builder-block-list">
            {blockOptions.map((block) => (
              <div
                className="builder-block-row"
                data-block-type={block.type}
                key={block.type}
              >
                <button
                  aria-label={`Drag ${block.label} block`}
                  className="builder-block-drag"
                  onMouseDown={(event) =>
                    editorRef.current?.startBlockDrag(block.type, event.nativeEvent)
                  }
                  type="button"
                >
                  <span aria-hidden="true">⠿</span>
                  <span>{block.label}</span>
                </button>
                <button
                  aria-label={`${block.label} add`}
                  className="builder-block-add"
                  onClick={() => editorRef.current?.addBlock(block.type)}
                  type="button"
                >
                  ＋
                </button>
              </div>
            ))}
          </div>
          <p className="muted small builder-help">
            Blocks map only to the supported PagePayloadV1 node set.
          </p>
          <div className="builder-layers-section">
            <div className="builder-panel-heading">
              <span className="eyebrow">Layers</span>
              <strong>Page structure</strong>
            </div>
            <div
              ref={layerTreeRef}
              aria-label="Page layers"
              className="builder-layer-tree"
              role="tree"
            >
              {canvasState ? (
                renderLayerNodes(
                  canvasState.nodes,
                  undefined,
                  selected?.id,
                  (id) => editorRef.current?.selectNode(id),
                  toggleLayer,
                  startLayerDrag,
                  collapsedLayerIds,
                  layerDraggingId,
                  layerDropIntent,
                )
              ) : (
                <span className="muted small">Preparing layers…</span>
              )}
            </div>
          </div>
        </aside>

        <section className="builder-canvas-panel" aria-label="Builder canvas">
          <div className="builder-viewport-toolbar">
            <div
              className="builder-interaction-toolbar"
              aria-label="Canvas interaction mode"
            >
              <button
                aria-pressed={interactionMode === 'select'}
                className={`button button-small${interactionMode === 'select' ? ' active' : ''}`}
                onClick={() => editorRef.current?.setInteractionMode('select')}
                type="button"
              >
                ↖ Select
              </button>
              <button
                aria-pressed={interactionMode === 'hand'}
                className={`button button-small${interactionMode === 'hand' ? ' active' : ''}`}
                onClick={() => editorRef.current?.setInteractionMode('hand')}
                type="button"
              >
                ✋ Hand
              </button>
              <span className="muted small">V/H · Space + drag · middle drag</span>
            </div>
            <span className="muted small">Viewport</span>
            <div className="builder-viewport-list">
              {BUILDER_VIEWPORTS.map((item) => (
                <button
                  className={
                    viewport === item
                      ? 'button button-small active'
                      : 'button button-small'
                  }
                  key={item}
                  onClick={() => changeViewport(item)}
                  type="button"
                >
                  {item.charAt(0).toUpperCase() + item.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="builder-editor-shell">
            <GrapesEditor
              initialPayload={payload}
              onDirty={markDirty}
              onError={(message) => {
                setSaveStatus('error');
                setError(`Editor error: ${message}`);
              }}
              onHistoryChange={setHistory}
              onCanvasStateChange={setCanvasState}
              onInteractionModeChange={setInteractionMode}
              onReady={() =>
                setSaveStatus((current) =>
                  current === 'initializing' ? 'saved' : current,
                )
              }
              onSelectionChange={(nextSelection) => {
                selectedNodeRef.current = nextSelection;
                setSelected(nextSelection);
              }}
              ref={editorRef}
            />
            <PageMinimap
              onFitPage={() => editorRef.current?.fitCanvas()}
              onNavigate={(x, y) => editorRef.current?.scrollToCanvasPoint(x, y)}
              onSelectNode={(id) => editorRef.current?.selectNode(id)}
              onZoomChange={(zoom) => editorRef.current?.setCanvasZoom(zoom)}
              selectedId={selected?.id}
              state={canvasState}
            />
          </div>
        </section>

        <aside className="builder-panel builder-properties-panel">
          {selected ? (
            <div className="builder-properties-stack">
              <div className="builder-properties-heading">
                <div className="builder-panel-heading">
                  <span className="eyebrow">Properties</span>
                  <strong>{inspectorNodeLabel(selected.type)}</strong>
                </div>
                <p
                  className="builder-properties-summary"
                  title={inspectorNodeSummary(selected)}
                >
                  {inspectorNodeSummary(selected)}
                </p>
                {canvasState ? (
                  <nav className="builder-breadcrumb" aria-label="Selection path">
                    {layerPath(canvasState.nodes, selected.id).map(
                      (node, index, path) => (
                        <span key={node.id}>
                          <button
                            aria-label={`Navigate to ${node.label}`}
                            className="builder-breadcrumb-button"
                            onClick={() => editorRef.current?.selectNode(node.id)}
                            type="button"
                          >
                            {node.label}
                          </button>
                          {index < path.length - 1 ? (
                            <span aria-hidden="true"> / </span>
                          ) : null}
                        </span>
                      ),
                    )}
                  </nav>
                ) : null}
                <div
                  className="builder-inspector-context"
                  aria-label="Active style viewport"
                >
                  <span>Editing</span>
                  <strong>{inspectorNodeLabel(viewport)}</strong>
                  <span>styles</span>
                </div>
              </div>

              {selected.type === 'form' && selected.form ? (
                <InspectorSection
                  label="Form"
                  onToggle={(open) => toggleInspectorSection('content', open)}
                  open={openInspectorSections.content}
                >
                  <div className="builder-inspector-fields">
                    <label>
                      Submit button label
                      <input
                        aria-label="Submit button label"
                        onChange={(event) =>
                          updateForm({
                            ...selected.form!,
                            submitLabel: event.target.value,
                          })
                        }
                        value={selected.form.submitLabel}
                      />
                    </label>
                    <label>
                      Success message
                      <textarea
                        aria-label="Form success message"
                        onChange={(event) =>
                          updateForm({
                            ...selected.form!,
                            successMessage: event.target.value,
                          })
                        }
                        rows={3}
                        value={selected.form.successMessage}
                      />
                    </label>
                    <div className="builder-form-fields">
                      <div className="builder-property-control">
                        <span className="builder-property-label">Fields</span>
                        <button
                          className="button button-secondary button-small"
                          disabled={selected.form.fields.length >= 20}
                          onClick={addFormField}
                          type="button"
                        >
                          + Add field
                        </button>
                      </div>
                      {selected.form.fields.map((field, index) => (
                        <fieldset className="builder-form-field" key={field.id}>
                          <legend>
                            {index + 1}. {field.label}
                          </legend>
                          <label>
                            Label
                            <input
                              aria-label={`Form field label ${field.id}`}
                              onChange={(event) =>
                                patchFormField(index, { label: event.target.value })
                              }
                              value={field.label}
                            />
                          </label>
                          <label>
                            Type
                            <select
                              aria-label={`Form field type ${field.id}`}
                              onChange={(event) =>
                                changeFormFieldType(
                                  index,
                                  event.target.value as FormField['type'],
                                )
                              }
                              value={field.type}
                            >
                              <option value="text">Text</option>
                              <option value="email">Email</option>
                              <option value="phone">Phone</option>
                              <option value="textarea">Textarea</option>
                              <option value="select">Select</option>
                              <option value="checkbox">Checkbox</option>
                              <option value="radio">Radio</option>
                            </select>
                          </label>
                          {'placeholder' in field ? (
                            <label>
                              Placeholder
                              <input
                                aria-label={`Form field placeholder ${field.id}`}
                                onChange={(event) =>
                                  patchFormField(index, {
                                    placeholder: event.target.value,
                                  })
                                }
                                value={field.placeholder ?? ''}
                              />
                            </label>
                          ) : null}
                          <label className="checkbox-field">
                            <input
                              aria-label={`Form field required ${field.id}`}
                              checked={field.required}
                              onChange={(event) =>
                                patchFormField(index, { required: event.target.checked })
                              }
                              type="checkbox"
                            />
                            Required
                          </label>
                          <div className="row-actions">
                            <button
                              aria-label={`Move field ${field.id} up`}
                              className="button button-ghost button-small"
                              disabled={index === 0}
                              onClick={() => moveFormField(index, -1)}
                              type="button"
                            >
                              ↑
                            </button>
                            <button
                              aria-label={`Move field ${field.id} down`}
                              className="button button-ghost button-small"
                              disabled={index === selected.form!.fields.length - 1}
                              onClick={() => moveFormField(index, 1)}
                              type="button"
                            >
                              ↓
                            </button>
                            <button
                              aria-label={`Remove field ${field.id}`}
                              className="button button-danger button-small"
                              disabled={selected.form!.fields.length <= 1}
                              onClick={() => removeFormField(index)}
                              type="button"
                            >
                              Remove
                            </button>
                          </div>
                        </fieldset>
                      ))}
                    </div>
                  </div>
                </InspectorSection>
              ) : null}

              {selected.type === 'text' ? (
                <InspectorSection
                  label="Content"
                  onToggle={(open) => toggleInspectorSection('content', open)}
                  open={openInspectorSections.content}
                >
                  <div className="builder-inspector-fields">
                    <label>
                      Text
                      <textarea
                        aria-label="Text content"
                        onChange={updateSelectedText}
                        rows={5}
                        value={selected.text ?? ''}
                      />
                    </label>
                    <div className="builder-property-control">
                      <span className="builder-property-label">Alignment</span>
                      <div
                        aria-label="Text alignment"
                        className="builder-segmented-control"
                        role="group"
                      >
                        {alignmentOptions.map((option) => (
                          <button
                            aria-label={`Align text ${option.label.toLowerCase()}`}
                            aria-pressed={selected.align === option.value}
                            className={
                              selected.align === option.value ? 'active' : undefined
                            }
                            key={option.value}
                            onClick={() =>
                              editorRef.current?.updateSelectedAlign(option.value)
                            }
                            title={`Align ${option.label.toLowerCase()}`}
                            type="button"
                          >
                            <span aria-hidden="true">{option.icon}</span>
                            <span>{option.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </InspectorSection>
              ) : null}

              {selected.type === 'button' ? (
                <InspectorSection
                  label="Content"
                  onToggle={(open) => toggleInspectorSection('content', open)}
                  open={openInspectorSections.content}
                >
                  <div className="builder-inspector-fields">
                    <label>
                      Label
                      <input
                        aria-label="Button label"
                        onChange={(event) =>
                          editorRef.current?.updateSelectedText(event.target.value)
                        }
                        value={selected.label ?? ''}
                      />
                    </label>
                    <label>
                      Link
                      <input
                        aria-label="Button link"
                        onChange={(event) => updateSelectedAttribute('href', event)}
                        value={selected.href ?? ''}
                      />
                    </label>
                    <label>
                      Target
                      <select
                        aria-label="Button target"
                        onChange={(event) => updateSelectedAttribute('target', event)}
                        value={selected.target ?? '_self'}
                      >
                        <option value="_self">Same tab</option>
                        <option value="_blank">New tab</option>
                      </select>
                    </label>
                  </div>
                </InspectorSection>
              ) : null}

              {selected.type === 'image' ? (
                <InspectorSection
                  label="Content"
                  onToggle={(open) => toggleInspectorSection('content', open)}
                  open={openInspectorSections.content}
                >
                  <div className="builder-inspector-fields">
                    <label>
                      Source
                      <input
                        aria-label="Image source"
                        onChange={(event) => updateSelectedAttribute('src', event)}
                        value={selected.src ?? ''}
                      />
                    </label>
                    <label>
                      Alt text
                      <input
                        aria-label="Image alt text"
                        onChange={(event) => updateSelectedAttribute('alt', event)}
                        value={selected.alt ?? ''}
                      />
                    </label>
                    <label>
                      Workspace asset
                      <select
                        aria-label="Workspace asset"
                        onChange={(event) =>
                          editorRef.current?.selectAsset(event.target.value)
                        }
                        value={selected.src ?? ''}
                      >
                        <option value="">Select an asset</option>
                        {usableAssets.map((asset) => (
                          <option key={asset.id} value={asset.storageKey}>
                            {asset.filename}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </InspectorSection>
              ) : null}

              {inspectorStyleSections.map((section) =>
                renderStyleSection(section, styleBlock),
              )}

              <InspectorSection
                label="Advanced"
                onToggle={(open) => toggleInspectorSection('advanced', open)}
                open={openInspectorSections.advanced}
              >
                <div className="builder-inspector-advanced">
                  <span className="muted small">Node ID</span>
                  <code>{selected.id}</code>
                  <span className="muted small">
                    This identifier is stable for this page and is not edited here.
                  </span>
                </div>
              </InspectorSection>

              {selected.type !== 'root' ? (
                <div className="builder-selection-actions">
                  <span className="muted small">
                    Use the ⠿ handle to move this node. Drop before, inside, or after a
                    target.
                  </span>
                  <div className="row-actions">
                    <button
                      aria-label="Move up"
                      className="button button-ghost button-small"
                      onClick={() => editorRef.current?.moveSelected('up')}
                      type="button"
                    >
                      ↑ Up
                    </button>
                    <button
                      aria-label="Move down"
                      className="button button-ghost button-small"
                      onClick={() => editorRef.current?.moveSelected('down')}
                      type="button"
                    >
                      ↓ Down
                    </button>
                    <button
                      aria-label="Outdent"
                      className="button button-ghost button-small"
                      onClick={() => editorRef.current?.moveSelected('outdent')}
                      type="button"
                    >
                      ← Outdent
                    </button>
                    <button
                      aria-label="Indent"
                      className="button button-ghost button-small"
                      onClick={() => editorRef.current?.moveSelected('indent')}
                      type="button"
                    >
                      → Indent
                    </button>
                  </div>
                  <div className="row-actions">
                    <button
                      className="button button-secondary button-small"
                      onClick={() => editorRef.current?.duplicateSelected()}
                      type="button"
                    >
                      Duplicate
                    </button>
                    <button
                      className="button button-danger button-small"
                      onClick={() => {
                        editorRef.current?.deleteSelected();
                        selectedNodeRef.current = null;
                        setSelected(null);
                      }}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="builder-properties-empty">
              <div className="builder-panel-heading">
                <span className="eyebrow">Properties</span>
                <strong>Nothing selected</strong>
              </div>
              <p className="muted small">
                Select an element on the canvas or in Layers to edit its properties.
              </p>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

function styleValue(
  style: Record<string, string | undefined>,
  editorProperty: string,
): string {
  const map: Record<string, string> = {
    display: 'display',
    width: 'width',
    'max-width': 'maxWidth',
    'min-height': 'minHeight',
    padding: 'padding',
    margin: 'margin',
    gap: 'gap',
    'background-color': 'backgroundColor',
    color: 'color',
    'font-size': 'fontSize',
    'font-weight': 'fontWeight',
    'text-align': 'textAlign',
    'border-radius': 'borderRadius',
  };
  return style[map[editorProperty] ?? editorProperty] ?? '';
}
