'use client';

import {
  AssetListResponseSchema,
  ExtensionListResponseSchema,
  PageCapabilityGraphSchema,
  PageExtensionInstanceSchema,
  PageExtensionListResponseSchema,
  PageSchema,
  PAGE_PREVIEW_MESSAGE_TYPE,
  PAGE_PREVIEW_READY_MESSAGE_TYPE,
  FormPropsSchema,
  PagePayloadSchema,
  NavigationListResponseSchema,
  createPageDocument,
  PageVersionListResponseSchema,
  PageVersionSchema,
  PAGE_COMPONENT_REGISTRY,
  PAGE_STYLE_PROPERTY_BY_EDITOR_KEY,
  PAGE_STYLE_PROPERTY_GROUPS,
  type Asset,
  type FormField,
  type FormProps,
  type Page,
  type PageDocument,
  type PageVersion,
  type ExtensionDescriptor,
  type PageExtensionInstance,
  type PageCapabilityGraph,
  type Navigation,
  type ComponentPropertyDefinition,
} from '@payload/contracts';
import { useRouter } from 'next/navigation';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

import { ApiClientError, api } from '../app/lib/api';
import {
  ColorField,
  DateTimeField,
  NumberField,
  SegmentedControl,
  SelectField,
  SpacingControl,
  TextAreaField,
  TextField,
  UnitField,
  type SegmentedOption,
} from '../app/ui/fields';
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
import type { BuilderBlockType, BuilderViewport } from './builder-adapter';
import { isBuilderExtensionAvailableForPage } from './builder-extension-registry';
import type { DropPosition, MoveNodeIntent } from './builder-interaction';
import { saveStatusAfterAcknowledgement } from './builder-save';

type BuilderShellProps = {
  workspaceId: string;
  siteId: string;
  pageId: string;
};

type LoadState = 'loading' | 'ready' | 'error';
type SaveStatus = 'initializing' | 'saved' | 'unsaved' | 'saving' | 'error' | 'conflict';
type BuilderTool = 'add' | 'layers' | 'assets' | 'sections';

type AvailableBlockOption = {
  type: BuilderBlockType;
  label: string;
  extensionId?: string;
};

const blockOptions: AvailableBlockOption[] = Object.values(PAGE_COMPONENT_REGISTRY)
  .filter((definition) => definition.type !== 'root' && definition.type !== 'extension')
  .map((definition) => ({
    type: definition.type as BuilderBlockType,
    label: definition.label,
  }));

type InspectorSectionKey =
  | 'content'
  | 'layout'
  | 'size'
  | 'spacing'
  | 'typography'
  | 'background'
  | 'border'
  | 'effects'
  | 'appearance'
  | 'advanced';

type InspectorStyleSection = {
  key: Exclude<InspectorSectionKey, 'content' | 'advanced'>;
  label: string;
  fields: readonly ComponentPropertyDefinition[];
};

const rendererBaseUrl =
  process.env.NEXT_PUBLIC_RENDERER_BASE_URL ?? 'http://127.0.0.1:3002';
const rendererOrigin = (() => {
  try {
    return new URL(rendererBaseUrl).origin;
  } catch {
    return 'http://127.0.0.1:3002';
  }
})();

const inspectorStyleSections: readonly InspectorStyleSection[] = (
  Object.entries(PAGE_STYLE_PROPERTY_GROUPS) as Array<
    [InspectorStyleSection['key'], readonly ComponentPropertyDefinition[]]
  >
).map(([key, fields]) => ({
  key,
  label: key.charAt(0).toUpperCase() + key.slice(1),
  fields,
}));

const inspectorQuickStyleSections: readonly InspectorStyleSection[] = [
  {
    key: 'layout',
    label: 'Layout',
    fields: [...PAGE_STYLE_PROPERTY_GROUPS.layout, ...PAGE_STYLE_PROPERTY_GROUPS.size],
  },
  {
    key: 'spacing',
    label: 'Spacing',
    fields: PAGE_STYLE_PROPERTY_GROUPS.spacing,
  },
  {
    key: 'typography',
    label: 'Typography',
    fields: PAGE_STYLE_PROPERTY_GROUPS.typography,
  },
  {
    key: 'appearance',
    label: 'Appearance',
    fields: [
      ...PAGE_STYLE_PROPERTY_GROUPS.background,
      ...PAGE_STYLE_PROPERTY_GROUPS.border,
      ...PAGE_STYLE_PROPERTY_GROUPS.effects,
    ],
  },
];

type InspectorTab = 'content' | 'style' | 'settings';

const alignmentOptions: readonly SegmentedOption<'left' | 'center' | 'right'>[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
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
  childrenByParent: ReadonlyMap<string | undefined, BuilderCanvasNode[]>,
  visibleNodeIds: ReadonlySet<string> | null,
  parentId: string | undefined,
  selectedId: string | undefined,
  onSelect: (id: string) => void,
  onToggle: (id: string) => void,
  onKeyDown: (
    node: BuilderCanvasNode,
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => void,
  onDragStart: (
    node: BuilderCanvasNode,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void,
  collapsedIds: Set<string>,
  draggingId: string | null,
  dropIntent: MoveNodeIntent | null,
  focusableId: string | undefined,
): ReactNode {
  return (childrenByParent.get(parentId) ?? [])
    .filter((node) => !visibleNodeIds || visibleNodeIds.has(node.id))
    .map((node) => {
      const hasChildren = (childrenByParent.get(node.id) ?? []).some(
        (child) => !visibleNodeIds || visibleNodeIds.has(child.id),
      );
      const children =
        hasChildren && !collapsedIds.has(node.id)
          ? renderLayerNodes(
              nodes,
              childrenByParent,
              visibleNodeIds,
              node.id,
              selectedId,
              onSelect,
              onToggle,
              onKeyDown,
              onDragStart,
              collapsedIds,
              draggingId,
              dropIntent,
              focusableId,
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
              aria-expanded={hasChildren ? !collapsedIds.has(node.id) : undefined}
              aria-level={node.depth + 1}
              aria-selected={node.id === selectedId}
              className={`builder-layer-button${node.id === selectedId ? ' selected' : ''}`}
              data-builder-layer-id={node.id}
              onClick={() => onSelect(node.id)}
              onKeyDown={(event) => onKeyDown(node, event)}
              role="treeitem"
              tabIndex={node.id === focusableId ? 0 : -1}
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
  if (selected.type === 'countdown') {
    return selected.countdown?.label?.trim() || 'Countdown element';
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
  const [saveInFlight, setSaveInFlight] = useState(false);
  const [page, setPage] = useState<Page | null>(null);
  const [version, setVersion] = useState<PageVersion | null>(null);
  // Model A: GrapesJS owns the live editable document. This is only the last
  // validated server snapshot used to initialize the editor, never a second
  // mutable source of truth for Canvas/Layers/Inspector.
  const [pageDocument, setPageDocument] = useState<PageDocument | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [siteGlobals, setSiteGlobals] = useState<{
    header: Navigation | null;
    footer: Navigation | null;
  }>({ header: null, footer: null });
  const [enabledExtensionIds, setEnabledExtensionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [customExtensions, setCustomExtensions] = useState<ExtensionDescriptor[]>([]);
  const [pageExtensions, setPageExtensions] = useState<PageExtensionInstance[]>([]);
  const [pageCapabilities, setPageCapabilities] = useState<PageCapabilityGraph | null>(
    null,
  );
  const [selected, setSelected] = useState<SelectedBuilderNode | null>(null);
  const [canvasState, setCanvasState] = useState<BuilderCanvasState | null>(null);
  const [viewport, setViewport] = useState<BuilderViewport>('desktop');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('content');
  const [openInspectorSections, setOpenInspectorSections] = useState<
    Record<InspectorSectionKey, boolean>
  >({
    content: true,
    layout: true,
    size: true,
    spacing: true,
    typography: false,
    background: false,
    border: false,
    effects: false,
    appearance: false,
    advanced: false,
  });
  const viewportChangingRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const localMutationSequenceRef = useRef(0);
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
  const [blockQuery, setBlockQuery] = useState('');
  const [layerQuery, setLayerQuery] = useState('');
  const [activeTool, setActiveTool] = useState<BuilderTool>('add');
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const layerTreeRef = useRef<HTMLDivElement>(null);
  const layerPointerCleanupRef = useRef<(() => void) | null>(null);
  const layerHoverExpandTimerRef = useRef<number | null>(null);
  const layerHoverExpandTargetRef = useRef<string | null>(null);
  const previewWindowRef = useRef<Window | null>(null);

  const isDirty =
    saveStatus === 'unsaved' ||
    saveStatus === 'saving' ||
    saveStatus === 'error' ||
    saveStatus === 'conflict';
  const pageExtensionState = new Map(
    pageExtensions.map((item) => [item.extensionId, item.enabled]),
  );
  const availableBlockOptions: AvailableBlockOption[] = [
    ...blockOptions.filter(
      (block) =>
        block.type !== 'countdown' ||
        isBuilderExtensionAvailableForPage(
          'countdown',
          enabledExtensionIds,
          pageExtensionState,
        ),
    ),
    ...customExtensions
      .filter(
        (extension) =>
          extension.tenantEnabled &&
          pageExtensionState.get(extension.manifest.id) !== false,
      )
      .map((extension) => ({
        type: 'extension' as const,
        extensionId: extension.manifest.id,
        label: extension.manifest.name,
      })),
  ];
  const visibleBlockOptions = availableBlockOptions.filter((block) => {
    const query = blockQuery.trim().toLowerCase();
    return (
      !query ||
      block.label.toLowerCase().includes(query) ||
      block.type.toLowerCase().includes(query) ||
      block.extensionId?.toLowerCase().includes(query)
    );
  });
  const toolBlockOptions =
    activeTool === 'sections'
      ? visibleBlockOptions.filter((block) =>
          ['section', 'container'].includes(block.type),
        )
      : visibleBlockOptions;
  const styleBlock = selected?.style?.[viewportStyleKey(viewport)] ?? {};
  const layerChildren = useMemo(() => {
    const index = new Map<string | undefined, BuilderCanvasNode[]>();
    for (const node of canvasState?.nodes ?? []) {
      const siblings = index.get(node.parentId) ?? [];
      siblings.push(node);
      index.set(node.parentId, siblings);
    }
    return index;
  }, [canvasState?.nodes]);
  const visibleLayerIds = useMemo(() => {
    const query = layerQuery.trim().toLowerCase();
    if (!query || !canvasState) return null;
    const byId = new Map(canvasState.nodes.map((node) => [node.id, node]));
    const visible = new Set<string>();
    for (const node of canvasState.nodes) {
      if (
        !node.label.toLowerCase().includes(query) &&
        !node.type.toLowerCase().includes(query) &&
        !node.id.toLowerCase().includes(query)
      ) {
        continue;
      }
      let current: BuilderCanvasNode | undefined = node;
      while (current) {
        visible.add(current.id);
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
    }
    return visible;
  }, [canvasState, layerQuery]);
  const layerNavigationIds = useMemo(() => {
    const result: string[] = [];
    function visit(parentId: string | undefined) {
      for (const node of layerChildren.get(parentId) ?? []) {
        if (visibleLayerIds && !visibleLayerIds.has(node.id)) continue;
        result.push(node.id);
        const children = (layerChildren.get(node.id) ?? []).filter(
          (child) => !visibleLayerIds || visibleLayerIds.has(child.id),
        );
        if (children.length > 0 && !collapsedLayerIds.has(node.id)) {
          visit(node.id);
        }
      }
    }
    visit(undefined);
    return result;
  }, [collapsedLayerIds, layerChildren, visibleLayerIds]);
  const focusableLayerId =
    selected && layerNavigationIds.includes(selected.id)
      ? selected.id
      : layerNavigationIds[0];
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

  function focusLayer(id: string) {
    editorRef.current?.selectNode(id);
    window.requestAnimationFrame(() => {
      const button = Array.from(
        layerTreeRef.current?.querySelectorAll<HTMLButtonElement>(
          '[data-builder-layer-id]',
        ) ?? [],
      ).find((candidate) => candidate.dataset.builderLayerId === id);
      button?.focus();
    });
  }

  function handleLayerKeyDown(
    node: BuilderCanvasNode,
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) {
    const currentIndex = layerNavigationIds.indexOf(node.id);
    if (currentIndex === -1) return;

    const children = (layerChildren.get(node.id) ?? []).filter(
      (child) => !visibleLayerIds || visibleLayerIds.has(child.id),
    );
    const isCollapsed = collapsedLayerIds.has(node.id);
    let nextId: string | undefined;

    switch (event.key) {
      case 'ArrowDown':
        nextId = layerNavigationIds[currentIndex + 1];
        break;
      case 'ArrowUp':
        nextId = layerNavigationIds[currentIndex - 1];
        break;
      case 'Home':
        nextId = layerNavigationIds[0];
        break;
      case 'End':
        nextId = layerNavigationIds[layerNavigationIds.length - 1];
        break;
      case 'ArrowRight':
        if (children.length === 0) return;
        event.preventDefault();
        if (isCollapsed) {
          toggleLayer(node.id);
          return;
        }
        nextId = children[0]?.id;
        break;
      case 'ArrowLeft':
        if (!isCollapsed && children.length > 0) {
          event.preventDefault();
          toggleLayer(node.id);
          return;
        }
        if (node.parentId && layerNavigationIds.includes(node.parentId)) {
          nextId = node.parentId;
        } else {
          return;
        }
        break;
      default:
        return;
    }

    if (!nextId) return;
    event.preventDefault();
    focusLayer(nextId);
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

        const nextPage = PageSchema.parse(pageResponse);
        if (nextPage.siteId !== siteId || nextPage.workspaceId !== workspaceId) {
          throw new Error('This page does not belong to the selected workspace/site.');
        }
        const versionList = PageVersionListResponseSchema.parse(versionsResponse);
        const nextVersion =
          versionList.items.find((item) => item.id === nextPage.currentDraftVersionId) ??
          versionList.items[0];
        if (!nextVersion) {
          throw new Error('This page does not have a current draft version.');
        }
        const nextPayload = PagePayloadSchema.parse(nextVersion.payload);
        setPage(nextPage);
        setVersion(PageVersionSchema.parse(nextVersion));
        setPageDocument(createPageDocument(nextPayload));
        setAssets(AssetListResponseSchema.parse(assetsResponse).items);
        try {
          const navigationResponse = NavigationListResponseSchema.parse(
            await api.get(`/sites/${siteId}/navigations`),
          );
          setSiteGlobals({
            header: navigationResponse.items.find((item) => item.key === 'main') ?? null,
            footer:
              navigationResponse.items.find((item) => item.key === 'footer') ?? null,
          });
        } catch {
          setSiteGlobals({ header: null, footer: null });
        }
        try {
          const [extensionResult, pageExtensionResult, capabilityResult] =
            await Promise.all([
              api.get('/extensions'),
              api.get(`/pages/${pageId}/extensions`),
              api.get(`/pages/${pageId}/extensions/capabilities`),
            ]);
          const extensionResponse = ExtensionListResponseSchema.parse(extensionResult);
          const pageExtensionResponse =
            PageExtensionListResponseSchema.parse(pageExtensionResult);
          setPageExtensions(pageExtensionResponse.items);
          setPageCapabilities(PageCapabilityGraphSchema.parse(capabilityResult));
          setCustomExtensions(
            extensionResponse.items.filter(
              (extension) => extension.custom && extension.tenantEnabled,
            ),
          );
          setEnabledExtensionIds(
            new Set(
              extensionResponse.items
                .filter((extension) => extension.tenantEnabled)
                .map((extension) => extension.manifest.id),
            ),
          );
        } catch {
          // Existing content remains editable when the user cannot read extension state.
          setEnabledExtensionIds(new Set());
          setPageExtensions([]);
          setPageCapabilities(null);
          setCustomExtensions([]);
        }
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
    localMutationSequenceRef.current += 1;
    setNotice(null);
    setSaveStatus('unsaved');
  }

  function postPreviewDocument(document?: PageDocument) {
    const previewWindow = previewWindowRef.current;
    if (!previewWindow || previewWindow.closed) return;
    try {
      const nextDocument = document ?? editorRef.current?.getDocument();
      if (!nextDocument) return;
      previewWindow.postMessage(
        { type: PAGE_PREVIEW_MESSAGE_TYPE, document: nextDocument },
        rendererOrigin,
      );
    } catch {
      previewWindowRef.current = null;
    }
  }

  function openLivePreview() {
    const previewWindow = window.open(
      `${rendererBaseUrl}/preview/${encodeURIComponent(pageId)}`,
      'payload-landing-page-preview',
    );
    if (!previewWindow) {
      setError('The preview window was blocked. Allow pop-ups for this workspace.');
      return;
    }
    previewWindowRef.current = previewWindow;
    previewWindow.focus();
    postPreviewDocument();
  }

  useEffect(() => {
    function handlePreviewMessage(event: MessageEvent<unknown>) {
      if (
        event.origin !== rendererOrigin ||
        event.source !== previewWindowRef.current ||
        !event.data ||
        typeof event.data !== 'object' ||
        (event.data as { type?: unknown }).type !== PAGE_PREVIEW_READY_MESSAGE_TYPE
      ) {
        return;
      }
      postPreviewDocument();
    }
    window.addEventListener('message', handlePreviewMessage);
    return () => window.removeEventListener('message', handlePreviewMessage);
  }, []);

  async function saveDraft() {
    if (!version || !editorRef.current || saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setSaveInFlight(true);
    setSaveStatus('saving');
    setError(null);
    setNotice(null);
    try {
      const nextDocument = editorRef.current.getDocument();
      const nextPayload = PagePayloadSchema.parse(nextDocument.payload);
      // GrapesJS can emit the final component:update asynchronously after an
      // inspector input event. Capture the acknowledgement point after the
      // payload snapshot so that event is included in this save, while edits
      // made after the snapshot still remain dirty.
      const saveSequence = localMutationSequenceRef.current;
      const nextVersion = PageVersionSchema.parse(
        await api.post(`/pages/${pageId}/versions`, {
          expectedVersionNumber: version.versionNumber,
          payload: nextPayload,
        }),
      );
      const currentPayloadResult = PagePayloadSchema.safeParse(
        editorRef.current.getDocument().payload,
      );
      const hasNewerPayloadChanges =
        !currentPayloadResult.success ||
        JSON.stringify(currentPayloadResult.data) !== JSON.stringify(nextPayload);
      setVersion(nextVersion);
      const nextPageExtensions = PageExtensionListResponseSchema.parse(
        await api.get(`/pages/${pageId}/extensions`),
      );
      setPageExtensions(nextPageExtensions.items);
      if (
        saveStatusAfterAcknowledgement(saveSequence, localMutationSequenceRef.current) ===
          'saved' &&
        !hasNewerPayloadChanges
      ) {
        setSaveStatus('saved');
        setNotice(`Saved draft version ${nextVersion.versionNumber}.`);
      } else {
        setSaveStatus('unsaved');
        setNotice(
          `Saved draft version ${nextVersion.versionNumber}. Newer local changes remain unsaved.`,
        );
      }
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
    } finally {
      saveInFlightRef.current = false;
      setSaveInFlight(false);
    }
  }

  async function publishPage() {
    if (saveStatus === 'unsaved' || saveStatus === 'saving') {
      setError('Save the current draft before publishing.');
      return;
    }
    setError(null);
    setNotice(null);
    try {
      const updated = PageSchema.parse(await api.post(`/pages/${pageId}/publish`, {}));
      setPage(updated);
      setNotice('Page published. The public site now uses the published snapshot.');
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    }
  }

  async function togglePageExtension(extensionId: string, enabled: boolean) {
    setError(null);
    try {
      const result = PageExtensionInstanceSchema.parse(
        await api.put(`/pages/${pageId}/extensions/${extensionId}`, { enabled }),
      );
      const capabilityGraph = PageCapabilityGraphSchema.parse(
        await api.get(`/pages/${pageId}/extensions/capabilities`),
      );
      setPageExtensions((current) => {
        const without = current.filter((item) => item.extensionId !== extensionId);
        return [...without, result].sort((left, right) =>
          left.extensionId.localeCompare(right.extensionId),
        );
      });
      setPageCapabilities(capabilityGraph);
      setNotice(`${extensionId} is ${enabled ? 'enabled' : 'disabled'} for this page.`);
    } catch (caughtError) {
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

  function updateSelectedStyle(property: string, value: string) {
    editorRef.current?.updateSelectedStyle(property, value);
  }

  function resetSelectedStyle(property: string) {
    editorRef.current?.resetSelectedStyle(property);
  }

  function updateForm(nextForm: FormProps) {
    const parsed = FormPropsSchema.safeParse(nextForm);
    if (parsed.success) {
      editorRef.current?.updateSelectedForm(parsed.data);
    }
  }

  function updateSelectedCountdown(key: 'label' | 'targetAt', value: string): void {
    if (!selected?.countdown) return;
    editorRef.current?.updateSelectedCountdown({
      ...selected.countdown,
      [key]: value,
    });
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
    if (!selected) return null;
    const allowedPropertyKeys = new Set(
      PAGE_COMPONENT_REGISTRY[selected.type].propertiesSchema
        .filter((property) => property.group === 'style')
        .map((property) => property.key),
    );
    const fields = section.fields.filter((field) => allowedPropertyKeys.has(field.key));
    if (fields.length === 0) return null;

    return (
      <InspectorSection
        key={section.key}
        label={section.label}
        onToggle={(open) => toggleInspectorSection(section.key, open)}
        open={openInspectorSections[section.key]}
      >
        <div className="builder-inspector-fields">
          {fields.map((option) => {
            const value = styleValue(styleBlock, option.key);
            const inheritedStyleBlock =
              viewport === 'mobile' &&
              styleValue(selected.style?.tablet ?? {}, option.key) !== ''
                ? (selected.style?.tablet ?? {})
                : (selected.style?.base ?? {});
            const inherited =
              viewport !== 'desktop' &&
              value === '' &&
              styleValue(inheritedStyleBlock, option.key) !== '';
            const inheritedViewport =
              viewport === 'mobile' &&
              inheritedStyleBlock === (selected.style?.tablet ?? {})
                ? 'Tablet'
                : 'Desktop';
            const description = inherited
              ? `Inherited from ${inheritedViewport}`
              : undefined;
            const hasOverride = viewport !== 'desktop' && value !== '';
            const resetOverride = hasOverride ? (
              <button
                aria-label={`Reset ${option.label} override`}
                className="button button-small button-ghost builder-reset-override"
                onClick={() => resetSelectedStyle(option.key)}
                type="button"
              >
                Reset override
              </button>
            ) : null;
            if (option.control === 'unit') {
              return (
                <div className="builder-inspector-field-stack" key={option.key}>
                  <UnitField
                    allowAuto={option.allowAuto}
                    compact
                    description={description}
                    label={option.label}
                    onValueChange={(nextValue) =>
                      updateSelectedStyle(option.key, nextValue)
                    }
                    value={value}
                  />
                  {resetOverride}
                </div>
              );
            }
            if (option.control === 'number') {
              const numericValue = Number(value);
              return (
                <div className="builder-inspector-field-stack" key={option.key}>
                  <NumberField
                    compact
                    description={description}
                    label={option.label}
                    max={option.max}
                    min={option.min}
                    onValueChange={(nextValue) =>
                      updateSelectedStyle(
                        option.key,
                        nextValue === undefined ? '' : String(nextValue),
                      )
                    }
                    step={option.step}
                    value={Number.isFinite(numericValue) ? numericValue : undefined}
                  />
                  {resetOverride}
                </div>
              );
            }
            if (option.control === 'spacing') {
              return (
                <div className="builder-inspector-field-stack" key={option.key}>
                  <SpacingControl
                    allowAuto={option.allowAuto}
                    compact
                    description={description}
                    label={option.label}
                    onValueChange={(nextValue) =>
                      updateSelectedStyle(option.key, nextValue)
                    }
                    value={value}
                  />
                  {resetOverride}
                </div>
              );
            }
            if (option.control === 'color') {
              return (
                <div className="builder-inspector-field-stack" key={option.key}>
                  <ColorField
                    compact
                    description={description}
                    label={option.label}
                    onValueChange={(nextValue) =>
                      updateSelectedStyle(option.key, nextValue)
                    }
                    value={value}
                  />
                  {resetOverride}
                </div>
              );
            }
            if (option.control === 'segmented') {
              return (
                <div className="builder-inspector-field-stack" key={option.key}>
                  <div className="ui-field ui-field-compact">
                    <span className="ui-field-label">{option.label}</span>
                    {description ? (
                      <p className="ui-field-description">{description}</p>
                    ) : null}
                    <SegmentedControl
                      ariaLabel={option.label}
                      onValueChange={(nextValue) =>
                        updateSelectedStyle(option.key, nextValue)
                      }
                      options={option.options ?? alignmentOptions}
                      value={value}
                    />
                  </div>
                  {resetOverride}
                </div>
              );
            }
            if (option.control === 'text') {
              return (
                <div className="builder-inspector-field-stack" key={option.key}>
                  <TextField
                    compact
                    description={description ?? option.description}
                    label={option.label}
                    onChange={(event) =>
                      updateSelectedStyle(option.key, event.target.value)
                    }
                    value={value}
                  />
                  {resetOverride}
                </div>
              );
            }
            return (
              <div className="builder-inspector-field-stack" key={option.key}>
                <SelectField
                  compact
                  description={description}
                  label={option.label}
                  onChange={(event) =>
                    updateSelectedStyle(option.key, event.target.value)
                  }
                  value={value}
                >
                  {option.options?.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </SelectField>
                {resetOverride}
              </div>
            );
          })}
        </div>
      </InspectorSection>
    );
  }

  function renderContentInspector() {
    if (!selected || selected.type === 'form' || selected.type === 'countdown') {
      return null;
    }
    const fields = PAGE_COMPONENT_REGISTRY[selected.type].propertiesSchema.filter(
      (property) => property.group === 'content',
    );
    if (fields.length === 0) return null;

    return (
      <InspectorSection
        label="Content"
        onToggle={(open) => toggleInspectorSection('content', open)}
        open={openInspectorSections.content}
      >
        <div className="builder-inspector-fields">
          {fields.map((property) => {
            if (selected.type === 'text' && property.key === 'text') {
              return (
                <TextAreaField
                  aria-label="Text content"
                  compact
                  description={property.description}
                  key={property.key}
                  label={property.label}
                  onChange={updateSelectedText}
                  rows={5}
                  value={selected.text ?? ''}
                />
              );
            }
            if (selected.type === 'text' && property.key === 'align') {
              return (
                <div className="ui-field ui-field-compact" key={property.key}>
                  <span className="ui-field-label">{property.label}</span>
                  <SegmentedControl
                    ariaLabel="Text alignment"
                    onValueChange={(nextValue) =>
                      editorRef.current?.updateSelectedAlign(nextValue)
                    }
                    options={alignmentOptions}
                    value={selected.align}
                  />
                </div>
              );
            }
            if (selected.type === 'button' && property.key === 'label') {
              return (
                <TextField
                  compact
                  description={property.description}
                  key={property.key}
                  label={property.label}
                  onChange={(event) =>
                    editorRef.current?.updateSelectedText(event.target.value)
                  }
                  value={selected.label ?? ''}
                />
              );
            }
            if (selected.type === 'button' && property.key === 'href') {
              return (
                <TextField
                  compact
                  description={property.description}
                  key={property.key}
                  label={property.label}
                  onChange={(event) => updateSelectedAttribute('href', event)}
                  type="url"
                  value={selected.href ?? ''}
                />
              );
            }
            if (selected.type === 'button' && property.key === 'target') {
              return (
                <SelectField
                  compact
                  description={property.description}
                  key={property.key}
                  label={property.label}
                  onChange={(event) => updateSelectedAttribute('target', event)}
                  value={selected.target ?? '_self'}
                >
                  {property.options?.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </SelectField>
              );
            }
            if (selected.type === 'image' && property.key === 'src') {
              return (
                <div key={property.key} className="builder-inspector-field-stack">
                  <SelectField
                    compact
                    description={property.description}
                    label="Workspace asset"
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
                  </SelectField>
                  <TextField
                    compact
                    description="Use a direct URL only when the asset is not in this workspace."
                    label="Image URL"
                    onChange={(event) => updateSelectedAttribute('src', event)}
                    type="url"
                    value={selected.src ?? ''}
                  />
                </div>
              );
            }
            if (selected.type === 'image' && property.key === 'alt') {
              return (
                <TextField
                  compact
                  description={property.description}
                  key={property.key}
                  label={property.label}
                  onChange={(event) => updateSelectedAttribute('alt', event)}
                  value={selected.alt ?? ''}
                />
              );
            }
            return null;
          })}
        </div>
      </InspectorSection>
    );
  }

  if (loadState === 'loading' || !pageDocument || !page || !version) {
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
            <code className="builder-page-path">{page.path}</code>
          </div>
        </div>
        <div className="builder-actions">
          <div className="builder-topbar-viewport" aria-label="Viewport">
            {BUILDER_VIEWPORTS.map((item) => (
              <button
                className={
                  viewport === item ? 'button button-small active' : 'button button-small'
                }
                key={`top-${item}`}
                onClick={() => changeViewport(item)}
                type="button"
              >
                {item.charAt(0).toUpperCase() + item.slice(1)}
              </button>
            ))}
          </div>
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
            className="button button-secondary"
            onClick={openLivePreview}
            type="button"
          >
            Live preview
          </button>
          <button
            className="button button-primary"
            disabled={saveInFlight || saveStatus === 'initializing'}
            onClick={() => void saveDraft()}
            type="button"
          >
            Save draft
          </button>
          <button
            className="button button-success"
            disabled={
              saveInFlight ||
              saveStatus === 'initializing' ||
              saveStatus === 'unsaved' ||
              saveStatus === 'saving' ||
              saveStatus === 'conflict'
            }
            onClick={() => void publishPage()}
            type="button"
          >
            Publish
          </button>
        </div>
      </header>

      <div className="builder-alerts">
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
      </div>

      <div className="builder-workspace">
        <div
          className={`builder-left-dock${leftPanelCollapsed ? ' is-collapsed' : ''}`}
          data-active-tool={activeTool}
        >
          <nav aria-label="Builder tools" className="builder-tool-rail">
            {(
              [
                ['add', '＋', 'Add blocks'],
                ['layers', '▤', 'Layers'],
                ['assets', '▧', 'Assets'],
                ['sections', '◫', 'Layout sections'],
              ] as const
            ).map(([tool, icon, label]) => (
              <button
                aria-label={label}
                aria-pressed={activeTool === tool}
                className={`builder-tool-button${activeTool === tool ? ' is-active' : ''}`}
                key={tool}
                onClick={() => setActiveTool(tool)}
                type="button"
              >
                <span aria-hidden="true">{icon}</span>
                <span>{tool === 'sections' ? 'Sections' : label}</span>
              </button>
            ))}
            <button
              aria-label={
                leftPanelCollapsed ? 'Expand builder panel' : 'Collapse builder panel'
              }
              className="builder-tool-button builder-tool-collapse"
              onClick={() => setLeftPanelCollapsed((current) => !current)}
              type="button"
            >
              <span aria-hidden="true">{leftPanelCollapsed ? '→' : '←'}</span>
              <span>{leftPanelCollapsed ? 'Expand' : 'Collapse'}</span>
            </button>
          </nav>
          <aside className="builder-panel builder-blocks-panel">
            {activeTool === 'add' || activeTool === 'sections' ? (
              <>
                <div className="builder-panel-heading">
                  <span className="eyebrow">
                    {activeTool === 'sections' ? 'Sections' : 'Page sections'}
                  </span>
                  <strong>
                    {activeTool === 'sections'
                      ? 'Add a layout section'
                      : 'Add section or content'}
                  </strong>
                </div>
                <label className="builder-block-search">
                  <span className="sr-only">Search components</span>
                  <input
                    aria-label="Search components"
                    onChange={(event) => setBlockQuery(event.target.value)}
                    placeholder="Search components"
                    type="search"
                    value={blockQuery}
                  />
                </label>
                <div className="builder-block-list">
                  {toolBlockOptions.map((block) => (
                    <div
                      className="builder-block-row"
                      data-block-type={block.type}
                      key={`${block.type}:${block.extensionId ?? ''}`}
                    >
                      <button
                        aria-label={`${block.extensionId ? 'Add' : 'Drag'} ${block.label} block`}
                        className="builder-block-drag"
                        onClick={
                          block.extensionId
                            ? () =>
                                editorRef.current?.addExtensionBlock(block.extensionId!)
                            : undefined
                        }
                        onMouseDown={
                          block.extensionId
                            ? undefined
                            : (event) =>
                                editorRef.current?.startBlockDrag(
                                  block.type,
                                  event.nativeEvent,
                                )
                        }
                        type="button"
                      >
                        <span aria-hidden="true">⠿</span>
                        <span>{block.label}</span>
                      </button>
                      <button
                        aria-label={`${block.label} add`}
                        className="builder-block-add"
                        onClick={() =>
                          block.extensionId
                            ? editorRef.current?.addExtensionBlock(block.extensionId)
                            : editorRef.current?.addBlock(block.type)
                        }
                        type="button"
                      >
                        ＋
                      </button>
                    </div>
                  ))}
                </div>
                {toolBlockOptions.length === 0 ? (
                  <p className="muted small builder-empty-message">
                    No matching components.
                  </p>
                ) : null}
                <p className="muted small builder-help">
                  Sections map to the supported, versioned PagePayload node set and keep
                  their canvas order when published.
                </p>
              </>
            ) : null}
            {activeTool === 'add' ? (
              <>
                <div className="builder-layers-section builder-page-capabilities">
                  <div className="builder-panel-heading">
                    <div>
                      <span className="eyebrow">Page runtime</span>
                      <strong>Extension graph</strong>
                    </div>
                    <span className="builder-capability-active">
                      {pageExtensions.filter((item) => item.enabled).length} active
                    </span>
                  </div>
                  <p className="muted small builder-capability-intro">
                    Page-level switches control which tenant extensions can run on this
                    page.
                  </p>
                  {pageExtensions.length === 0 ? (
                    <p className="muted small">
                      Add an extension block and save the page to attach an instance here.
                    </p>
                  ) : (
                    <div className="builder-capability-list">
                      {pageExtensions.map((instance) => (
                        <label
                          className={`builder-capability-row${instance.enabled ? '' : ' is-disabled'}`}
                          key={instance.extensionId}
                        >
                          <span>
                            <strong>{instance.extensionId}</strong>
                            <small>
                              {instance.enabled ? 'Enabled' : 'Disabled'} ·{' '}
                              {instance.runtimeIds.length} runtime resource(s)
                            </small>
                          </span>
                          <input
                            aria-label={`Enable ${instance.extensionId} for page`}
                            checked={instance.enabled}
                            onChange={(event) =>
                              void togglePageExtension(
                                instance.extensionId,
                                event.target.checked,
                              )
                            }
                            type="checkbox"
                          />
                        </label>
                      ))}
                    </div>
                  )}
                  {pageCapabilities ? (
                    <div
                      aria-label="Page capability summary"
                      className="builder-capability-summary"
                    >
                      <div className="builder-capability-metric">
                        <strong>{pageCapabilities.capabilities.length}</strong>
                        <span>Capabilities</span>
                      </div>
                      <div className="builder-capability-metric">
                        <strong>{pageCapabilities.runtimeIds.length}</strong>
                        <span>Runtimes</span>
                      </div>
                      <div className="builder-capability-metric">
                        <strong>{pageCapabilities.slots.length}</strong>
                        <span>Slots</span>
                      </div>
                      <div className="builder-capability-metric">
                        <strong>{pageCapabilities.dataBindings.length}</strong>
                        <span>Bindings</span>
                      </div>
                      {pageCapabilities.capabilities.length > 0 ? (
                        <div className="builder-capability-chips">
                          {pageCapabilities.capabilities.map((capability) => (
                            <span className="builder-capability-chip" key={capability}>
                              {capability}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
            {activeTool === 'assets' ? (
              <div className="builder-asset-panel">
                <div className="builder-panel-heading">
                  <span className="eyebrow">Workspace library</span>
                  <strong>Assets</strong>
                </div>
                {usableAssets.length ? (
                  <div className="builder-asset-list">
                    {usableAssets.map((asset) => (
                      <button
                        className="builder-asset-card"
                        key={asset.id}
                        onClick={() => editorRef.current?.selectAsset(asset.storageKey)}
                        type="button"
                      >
                        <img alt="" src={asset.storageKey} />
                        <span>{asset.filename}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="muted small">
                    No image assets are available in this workspace.
                  </p>
                )}
              </div>
            ) : null}
            {activeTool === 'layers' || activeTool === 'add' ? (
              <>
                <div className="builder-layers-section">
                  <div className="builder-panel-heading">
                    <span className="eyebrow">Layers</span>
                    <strong>Page structure</strong>
                  </div>
                  <label className="builder-layer-search">
                    <span className="sr-only">Search layers</span>
                    <input
                      aria-label="Search layers"
                      onChange={(event) => setLayerQuery(event.target.value)}
                      placeholder="Search layers"
                      type="search"
                      value={layerQuery}
                    />
                  </label>
                  <div
                    ref={layerTreeRef}
                    aria-label="Page layers"
                    className="builder-layer-tree"
                    role="tree"
                  >
                    {canvasState ? (
                      renderLayerNodes(
                        canvasState.nodes,
                        layerChildren,
                        visibleLayerIds,
                        undefined,
                        selected?.id,
                        (id) => editorRef.current?.selectNode(id),
                        toggleLayer,
                        handleLayerKeyDown,
                        startLayerDrag,
                        collapsedLayerIds,
                        layerDraggingId,
                        layerDropIntent,
                        focusableLayerId,
                      )
                    ) : (
                      <span className="muted small">Preparing layers…</span>
                    )}
                    {canvasState && visibleLayerIds && visibleLayerIds.size === 0 ? (
                      <span className="muted small">No matching layers.</span>
                    ) : null}
                  </div>
                </div>
              </>
            ) : null}
          </aside>
        </div>

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
          </div>
          <div aria-label="Site global content" className="builder-global-chrome">
            <div className="builder-global-chrome-row">
              <span className="eyebrow">Site header</span>
              <div className="builder-global-links">
                {(siteGlobals.header?.items ?? []).slice(0, 6).map((item) => (
                  <span key={item.id}>{item.label}</span>
                ))}
                {!siteGlobals.header?.items.length ? (
                  <span className="muted small">No main navigation configured</span>
                ) : null}
              </div>
              <span className="builder-global-lock">Locked · Navigation</span>
            </div>
            <div className="builder-global-chrome-row is-footer">
              <span className="eyebrow">Site footer</span>
              <div className="builder-global-links">
                {(siteGlobals.footer?.items ?? []).slice(0, 6).map((item) => (
                  <span key={item.id}>{item.label}</span>
                ))}
                {!siteGlobals.footer?.items.length ? (
                  <span className="muted small">No footer navigation configured</span>
                ) : null}
              </div>
              <span className="builder-global-lock">Locked · Navigation</span>
            </div>
          </div>
          <div className="builder-editor-shell">
            <GrapesEditor
              initialPayload={pageDocument.payload}
              onDirty={markDirty}
              onDocumentChange={postPreviewDocument}
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

        <aside
          className={`builder-panel builder-properties-panel${rightPanelCollapsed ? ' is-collapsed' : ''}`}
        >
          {selected ? (
            <div className="builder-properties-stack">
              <div className="builder-properties-heading">
                <div className="builder-properties-heading-row">
                  <div className="builder-panel-heading">
                    <span className="eyebrow">Properties</span>
                    <strong>{inspectorNodeLabel(selected.type)}</strong>
                  </div>
                  <button
                    aria-label="Collapse inspector"
                    className="button button-small button-ghost"
                    onClick={() => setRightPanelCollapsed(true)}
                    type="button"
                  >
                    Hide
                  </button>
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

              <div
                aria-label="Inspector tabs"
                className="builder-inspector-tabs"
                role="tablist"
              >
                {(['content', 'style', 'settings'] as const).map((tab) => (
                  <button
                    aria-selected={inspectorTab === tab}
                    className={inspectorTab === tab ? 'is-active' : ''}
                    key={tab}
                    onClick={() => setInspectorTab(tab)}
                    role="tab"
                    type="button"
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              {inspectorTab === 'content' ? (
                <>
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
                                    patchFormField(index, {
                                      required: event.target.checked,
                                    })
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

                  {selected.type === 'countdown' && selected.countdown ? (
                    <InspectorSection
                      label="Countdown"
                      onToggle={(open) => toggleInspectorSection('content', open)}
                      open={openInspectorSections.content}
                    >
                      <div className="builder-inspector-fields">
                        <TextField
                          compact
                          label="Countdown label"
                          onChange={(event) =>
                            updateSelectedCountdown('label', event.target.value)
                          }
                          value={selected.countdown.label}
                        />
                        <DateTimeField
                          compact
                          description="Stored as UTC in the existing countdown payload."
                          label="Target date and time"
                          onValueChange={(nextValue) => {
                            if (nextValue) updateSelectedCountdown('targetAt', nextValue);
                          }}
                          value={selected.countdown.targetAt}
                        />
                      </div>
                    </InspectorSection>
                  ) : null}

                  {renderContentInspector()}

                  {inspectorQuickStyleSections.map((section) =>
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
                        Common actions stay available while you edit content.
                      </span>
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
                </>
              ) : null}

              {inspectorTab === 'style' ? (
                <>
                  {inspectorStyleSections.map((section) =>
                    renderStyleSection(section, styleBlock),
                  )}
                </>
              ) : null}

              {inspectorTab === 'settings' ? (
                <>
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
                        Use the ⠿ handle to move this node. Drop before, inside, or after
                        a target.
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
                </>
              ) : null}
            </div>
          ) : (
            <div className="builder-properties-empty">
              <div className="builder-properties-heading-row">
                <div className="builder-panel-heading">
                  <span className="eyebrow">Properties</span>
                  <strong>Nothing selected</strong>
                </div>
                <button
                  aria-label="Collapse inspector"
                  className="button button-small button-ghost"
                  onClick={() => setRightPanelCollapsed(true)}
                  type="button"
                >
                  Hide
                </button>
              </div>
              <p className="muted small">
                Select an element on the canvas or in Layers to edit its properties.
              </p>
            </div>
          )}
        </aside>
        {rightPanelCollapsed ? (
          <button
            aria-label="Expand inspector"
            className="builder-inspector-expand button button-small button-secondary"
            onClick={() => setRightPanelCollapsed(false)}
            type="button"
          >
            Show inspector
          </button>
        ) : null}
      </div>
    </main>
  );
}

function styleValue(
  style: Record<string, string | undefined>,
  editorProperty: string,
): string {
  const property =
    PAGE_STYLE_PROPERTY_BY_EDITOR_KEY[
      editorProperty as keyof typeof PAGE_STYLE_PROPERTY_BY_EDITOR_KEY
    ];
  return style[property?.payloadKey ?? editorProperty] ?? '';
}
