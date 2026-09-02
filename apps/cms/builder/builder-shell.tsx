'use client';

import {
  AssetListResponseSchema,
  ExtensionListResponseSchema,
  LayoutExtensionListResponseSchema,
  LayoutExtensionVersionsResponseSchema,
  SiteGlobalPayloadV1Schema,
  PageCapabilityGraphSchema,
  PageExtensionInstanceSchema,
  PageExtensionListResponseSchema,
  PageSchema,
  PAGE_PREVIEW_MESSAGE_TYPE,
  PAGE_PREVIEW_READY_MESSAGE_TYPE,
  PagePayloadSchema,
  SiteSchema,
  PublicPageSchema,
  createPageDocument,
  PageVersionListResponseSchema,
  PageVersionSchema,
  PAGE_COMPONENT_REGISTRY,
  builderPreviewForComponent,
  type Asset,
  type ComponentBuilderExposure,
  type ComponentBuilderPreview,
  type Page,
  type PageDocument,
  type PageVersion,
  type ExtensionDescriptor,
  type LayoutExtensionResource,
  type SiteGlobalPayloadV1,
  type PageExtensionInstance,
  type PageCapabilityGraph,
  type BuilderDocumentKind,
  ReusableListResponseSchema,
  ReusableComponentSchema,
  SiteDesignSystemResponseSchema,
  createDefaultSiteDesignSystem,
  type ReusableComponent,
  type SiteDesignSystem,
  type StyleTokenReference,
  type ReusableComponentDocument,
  type ReusableRuntime,
  type ResolvedNavigationItem,
  type PagePreviewSnapshot,
  type PageRuntimeExtension,
} from '@payload/contracts';
import { useRouter } from 'next/navigation';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type CSSProperties,
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
import {
  BuilderAdapterError,
  reusableDocumentToEditorDefinition,
  reusableDocumentToEditorPageDocument,
  editorPageDocumentToReusableDocument,
  type BuilderBlockType,
  type BuilderViewport,
} from './builder-adapter';
import {
  BUILDER_PANEL_DEFAULT_WIDTHS,
  normalizePanelWidths,
  persistPanelWidths,
  readPanelWidths,
  type BuilderPanelSide,
  type BuilderPanelWidths,
} from './builder-panel-size';
import { BuilderPanelResizer } from './builder-panel-resizer';
import {
  BUILDER_BLOCK_PRESET_REGISTRY,
  GLOBAL_HEADER_PRESET_REGISTRY,
  GLOBAL_FOOTER_PRESET_REGISTRY,
  type BlockPresetId,
  type GlobalPresetId,
  type BuilderInsertable,
} from './block-presets';
import { isBuilderExtensionAvailableForPage } from './builder-extension-registry';
import type { DropPosition, MoveNodeIntent } from './builder-interaction';
import { saveStatusAfterAcknowledgement } from './builder-save';
import { BuilderContextToolbar } from './canvas/builder-context-toolbar';
import { QuickAddOverlay } from './canvas/quick-add-overlay';
import { BuilderBlockCard, BuilderBlockPreview } from './builder-block-catalog';
import { BUILT_IN_TEMPLATE_REGISTRY } from './template-registry';
import { resolveBuilderPreview } from './builder-preview-model';
import {
  BuilderInspector,
  type InspectorSectionKey,
  type InspectorTab,
} from './inspector/builder-inspector';
import { BuilderValidationNavigator } from './builder-validation-navigator';
import {
  createBuilderValidationCoordinator,
  createBuilderValidationIssue,
  dedupeBuilderValidationIssues,
  scopeForDocumentKind,
  sortBuilderValidationIssues,
  validationIssueFromError,
  type BuilderValidationCoordinator,
  type BuilderValidationIssue,
  type BuilderValidationScope,
} from './builder-validation';

type BuilderShellProps = {
  workspaceId: string;
  siteId: string;
  pageId: string;
  reusableId?: string;
};

type LoadState = 'loading' | 'ready' | 'error';
type SaveStatus =
  'initializing' | 'saved' | 'unsaved' | 'saving' | 'validation' | 'error' | 'conflict';
type SaveDraftResult = boolean;
type BuilderPreviewNavigation = {
  main?: ResolvedNavigationItem[];
  footer?: ResolvedNavigationItem[];
};
type BuilderSiteContext = {
  name: string;
  logo?: string;
};
type BuilderTool = 'add' | 'layers' | 'assets' | 'settings';
type AddPanelTab = 'layouts' | 'elements' | 'saved' | 'templates';

type AvailableBlockOption = {
  kind: 'component' | 'preset' | 'global-preset';
  type?: BuilderBlockType;
  presetId?: BlockPresetId;
  globalPresetId?: GlobalPresetId;
  label: string;
  category: 'layout' | 'content' | 'extension' | 'preset';
  extensionId?: string;
  layoutExtension?: {
    resource: LayoutExtensionResource;
    document: SiteGlobalPayloadV1;
  };
  keywords?: readonly string[];
  description: string;
  preview: ComponentBuilderPreview;
  group: ComponentBuilderExposure['group'] | 'preset';
  documentKinds: readonly BuilderDocumentKind[];
};

const blockGroupOrder = [
  'layout',
  'conversion',
  'typography',
  'media',
  'interactive',
  'advanced',
  'preset',
] as const;
const blockGroupLabels: Record<(typeof blockGroupOrder)[number], string> = {
  layout: 'Layout',
  typography: 'Text & type',
  media: 'Media',
  interactive: 'Interactive',
  conversion: 'Conversion',
  advanced: 'Extensions & advanced',
  preset: 'Presets',
};

const blockOptions: AvailableBlockOption[] = [
  ...Object.values(PAGE_COMPONENT_REGISTRY)
    .filter(
      (definition) =>
        definition.type !== 'root' &&
        definition.type !== 'extension' &&
        definition.builder.insertable,
    )
    .map((definition) => ({
      kind: 'component' as const,
      type: definition.type as BuilderBlockType,
      label: definition.label,
      category:
        definition.category === 'layout' ? ('layout' as const) : ('content' as const),
      group: definition.builder.group,
      keywords: [...definition.builder.keywords],
      description: definition.builder.description,
      preview: definition.builder.preview,
      documentKinds: definition.builder.documentKinds,
    })),
  ...BUILDER_BLOCK_PRESET_REGISTRY.map((preset) => ({
    kind: 'preset' as const,
    presetId: preset.id,
    label: preset.label,
    category: 'preset' as const,
    group: 'preset' as const,
    keywords: [...preset.keywords],
    description: preset.description,
    preview: preset.preview,
    documentKinds: ['page'] as const,
  })),
  ...[...GLOBAL_HEADER_PRESET_REGISTRY, ...GLOBAL_FOOTER_PRESET_REGISTRY].map(
    (preset) => ({
      kind: 'global-preset' as const,
      globalPresetId: preset.id,
      label: preset.label,
      category: 'preset' as const,
      group: 'preset' as const,
      keywords: [...preset.keywords],
      description: preset.description,
      preview: preset.preview,
      documentKinds: [preset.documentKind] as const,
    }),
  ),
];

const rendererBaseUrl =
  process.env.NEXT_PUBLIC_RENDERER_BASE_URL ?? 'http://127.0.0.1:3002';
const rendererOrigin = (() => {
  try {
    return new URL(rendererBaseUrl).origin;
  } catch {
    return 'http://127.0.0.1:3002';
  }
})();

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
  dropInvalid: boolean,
  invalidNodeIds: ReadonlySet<string>,
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
              dropInvalid,
              invalidNodeIds,
              focusableId,
            )
          : null;
      const dropClass =
        dropIntent?.targetNodeId === node.id
          ? ` drop-${dropIntent.position}${dropInvalid ? ' drop-invalid' : ''}`
          : '';
      const hasValidationIssue = invalidNodeIds.has(node.id);
      return (
        <div
          className={`builder-layer-node${draggingId === node.id ? ' dragging' : ''}${hasValidationIssue ? ' has-validation-issue' : ''}${dropClass}`}
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
              {hasValidationIssue ? (
                <span
                  aria-label="Needs attention"
                  className="builder-layer-validation-marker"
                  title="Needs attention"
                >
                  !
                </span>
              ) : null}
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
  const summaryValue = ['text', 'label', 'alt', 'src']
    .map((key) => selected.props[key])
    .find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    );
  if (summaryValue) return summaryValue.trim().slice(0, 80);
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

export default function BuilderShell({
  workspaceId,
  siteId,
  pageId,
  reusableId: initialReusableId,
}: BuilderShellProps) {
  const router = useRouter();
  const editorRef = useRef<GrapesEditorHandle>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('initializing');
  const [saveInFlight, setSaveInFlight] = useState(false);
  const [validationIssues, setValidationIssues] = useState<BuilderValidationIssue[]>([]);
  const [page, setPage] = useState<Page | null>(null);
  const [version, setVersion] = useState<PageVersion | null>(null);
  // Model A: GrapesJS owns the live editable document. This is only the last
  // validated server snapshot used to initialize the editor, never a second
  // mutable source of truth for Canvas/Layers/Inspector.
  const [pageDocument, setPageDocument] = useState<PageDocument | null>(null);
  const [editingReusableId, setEditingReusableId] = useState<string | null>(
    initialReusableId ?? null,
  );
  const [reusableEditorDocument, setReusableEditorDocument] =
    useState<PageDocument | null>(null);
  const [reusableEditorWrappedSource, setReusableEditorWrappedSource] = useState(false);
  const documentKind: BuilderDocumentKind = 'page';
  const [reusables, setReusables] = useState<ReusableComponent[]>([]);
  const [designSystem, setDesignSystem] = useState<SiteDesignSystem>(
    createDefaultSiteDesignSystem,
  );
  const [reusableSaveDraft, setReusableSaveDraft] = useState<{
    document: ReusableComponentDocument;
    name: string;
    description: string;
  } | null>(null);
  const [reusableSaveInFlight, setReusableSaveInFlight] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [enabledExtensionIds, setEnabledExtensionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [customExtensions, setCustomExtensions] = useState<ExtensionDescriptor[]>([]);
  const [layoutExtensions, setLayoutExtensions] = useState<
    Array<{
      resource: LayoutExtensionResource;
      document: SiteGlobalPayloadV1;
    }>
  >([]);
  const [pageExtensions, setPageExtensions] = useState<PageExtensionInstance[]>([]);
  const [pageCapabilities, setPageCapabilities] = useState<PageCapabilityGraph | null>(
    null,
  );
  const [selected, setSelected] = useState<SelectedBuilderNode | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focusPartName, setFocusPartName] = useState<string | undefined>(undefined);
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
    advanced: false,
  });
  const viewportChangingRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const localMutationSequenceRef = useRef(0);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('select');
  const [collapsedLayerIds, setCollapsedLayerIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [layerDraggingId, setLayerDraggingId] = useState<string | null>(null);
  const [layerDropIntent, setLayerDropIntent] = useState<MoveNodeIntent | null>(null);
  const [layerDropValidation, setLayerDropValidation] = useState<{
    valid: boolean;
    reason?: string;
  } | null>(null);
  const [quickAddTarget, setQuickAddTarget] = useState<{
    targetNodeId: string;
    position: 'before' | 'inside' | 'after';
  } | null>(null);
  const [blockQuery, setBlockQuery] = useState('');
  const [addPanelTab, setAddPanelTab] = useState<AddPanelTab>('layouts');
  const [addPanelTabTouched, setAddPanelTabTouched] = useState(false);
  const [layerQuery, setLayerQuery] = useState('');
  const [activeTool, setActiveTool] = useState<BuilderTool>('add');
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [panelWidths, setPanelWidths] = useState<BuilderPanelWidths>(
    BUILDER_PANEL_DEFAULT_WIDTHS,
  );
  const [panelResizeActive, setPanelResizeActive] = useState<BuilderPanelSide | null>(
    null,
  );
  const [panelPreferencesReady, setPanelPreferencesReady] = useState(false);
  const [builderViewportWidth, setBuilderViewportWidth] = useState(1440);
  const [reusableRuntime, setReusableRuntime] = useState<ReusableRuntime[]>([]);
  const [navigation, setNavigation] = useState<BuilderPreviewNavigation>({});
  const [siteContext, setSiteContext] = useState<BuilderSiteContext | null>(null);
  const [previewExtensions, setPreviewExtensions] = useState<PageRuntimeExtension[]>([]);
  const validationIssuesRef = useRef<BuilderValidationIssue[]>([]);
  const validationCoordinatorRef = useRef<BuilderValidationCoordinator | null>(null);
  const documentKindRef = useRef<BuilderDocumentKind>('page');
  const editingReusableIdRef = useRef<string | null>(initialReusableId ?? null);
  documentKindRef.current = documentKind;
  editingReusableIdRef.current = editingReusableId;
  validationIssuesRef.current = validationIssues;
  const layerTreeRef = useRef<HTMLDivElement>(null);
  const layerPointerCleanupRef = useRef<(() => void) | null>(null);
  const layerHoverExpandTimerRef = useRef<number | null>(null);
  const layerHoverExpandTargetRef = useRef<string | null>(null);
  const previewWindowRef = useRef<Window | null>(null);
  const previewSnapshotRef = useRef<PagePreviewSnapshot | null>(null);
  const previewFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const restorePanelPreferences = () => {
      setBuilderViewportWidth(window.innerWidth);
      setPanelWidths(readPanelWidths(window.localStorage, window.innerWidth));
      setPanelPreferencesReady(true);
    };
    restorePanelPreferences();

    const handleWindowResize = () => {
      setBuilderViewportWidth(window.innerWidth);
      setPanelWidths((current) => normalizePanelWidths(current, window.innerWidth));
    };
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, []);

  useEffect(() => {
    if (!panelPreferencesReady) return;
    persistPanelWidths(window.localStorage, panelWidths);
  }, [panelPreferencesReady, panelWidths]);

  function updatePanelWidth(side: BuilderPanelSide, width: number) {
    setPanelWidths((current) =>
      normalizePanelWidths({ ...current, [side]: width }, builderViewportWidth),
    );
  }

  const editingReusable = editingReusableId
    ? reusables.find((reusable) => reusable.id === editingReusableId)
    : undefined;
  const isEditingReusable = editingReusable !== undefined;
  const activePayload = isEditingReusable
    ? reusableEditorDocument?.payload
    : pageDocument?.payload;

  const isDirty =
    saveStatus === 'unsaved' ||
    saveStatus === 'saving' ||
    saveStatus === 'validation' ||
    saveStatus === 'error' ||
    saveStatus === 'conflict';
  const pageExtensionState = new Map(
    pageExtensions.map((item) => [item.extensionId, item.enabled]),
  );
  const availableBlockOptions: AvailableBlockOption[] = [
    ...blockOptions.filter(
      (block) =>
        (!isEditingReusable ||
          (block.kind !== 'global-preset' && block.type !== 'extension')) &&
        block.documentKinds.includes(documentKind) &&
        (block.type !== 'countdown' ||
          isBuilderExtensionAvailableForPage(
            'countdown',
            enabledExtensionIds,
            pageExtensionState,
          )),
    ),
    ...customExtensions
      .filter(
        (extension) =>
          documentKind === 'page' &&
          !isEditingReusable &&
          extension.tenantEnabled &&
          pageExtensionState.get(extension.manifest.id) !== false,
      )
      .map((extension) => ({
        kind: 'component' as const,
        type: 'extension' as const,
        extensionId: extension.manifest.id,
        label: extension.manifest.name,
        category: 'extension' as const,
        group: 'advanced' as const,
        keywords: [extension.manifest.id, extension.manifest.name],
        description: `Add the ${extension.manifest.name} extension to this page.`,
        preview: builderPreviewForComponent('extension'),
        documentKinds: ['page'] as const,
      })),
    ...layoutExtensions
      .filter(() => documentKind === 'page' && !isEditingReusable)
      .map((source) => ({
        kind: 'component' as const,
        type:
          source.resource.kind === 'header'
            ? ('global-header' as const)
            : ('global-footer' as const),
        label: source.resource.name,
        category: 'extension' as const,
        group: 'advanced' as const,
        keywords: [
          source.resource.name,
          source.resource.kind,
          'header',
          'footer',
          'layout extension',
        ],
        description: `Copy this ${source.resource.kind} extension into the page. Editing the source later will not change this page.`,
        preview: builderPreviewForComponent(
          source.resource.kind === 'header' ? 'global-header' : 'global-footer',
        ),
        documentKinds: ['page'] as const,
        layoutExtension: source,
      })),
  ];
  const visibleBlockOptions = availableBlockOptions.filter((block) => {
    const query = blockQuery.trim().toLowerCase();
    return (
      !query ||
      block.label.toLowerCase().includes(query) ||
      block.type?.toLowerCase().includes(query) ||
      block.presetId?.toLowerCase().includes(query) ||
      block.globalPresetId?.toLowerCase().includes(query) ||
      block.description.toLowerCase().includes(query) ||
      block.group.toLowerCase().includes(query) ||
      block.keywords?.some((keyword) => keyword.toLowerCase().includes(query)) ||
      block.extensionId?.toLowerCase().includes(query) ||
      block.layoutExtension?.resource.kind.includes(query)
    );
  });
  // Keep the initial Add surface discoverable for existing keyboard/palette
  // flows; the Layouts/Elements tabs provide an explicit focused filter once
  // the user chooses one.
  const toolBlockOptions = addPanelTabTouched
    ? addPanelTab === 'layouts' || addPanelTab === 'elements'
      ? visibleBlockOptions.filter((block) =>
          addPanelTab === 'layouts'
            ? block.group === 'layout' || block.group === 'preset'
            : block.group !== 'layout' && block.group !== 'preset',
        )
      : []
    : visibleBlockOptions;
  const toolBlockGroups = blockGroupOrder
    .map((category) => ({
      category,
      options: toolBlockOptions.filter((block) => block.group === category),
    }))
    .filter((group) => group.options.length > 0);
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
  const imageAssets = useMemo(
    () =>
      usableAssets.filter((asset) => asset.mimeType.toLowerCase().startsWith('image/')),
    [usableAssets],
  );
  const contextToolbarPosition = useMemo(() => {
    if (!canvasState || !selectedNodeId) return undefined;
    const node = canvasState.nodes.find((candidate) => candidate.id === selectedNodeId);
    if (!node) return undefined;
    const zoom = Math.max(canvasState.zoom / 100, 0.01);
    const viewport = canvasState.viewport;
    const x = (node.x - viewport.x + node.width / 2) * zoom;
    const top = (node.y - viewport.y) * zoom;
    const below = (node.y - viewport.y + node.height) * zoom + 10;
    const above = top - 46;
    const canvasWidth = viewport.width * zoom;
    const halfToolbar = 148;
    const left = Math.min(
      Math.max(x, Math.min(12 + halfToolbar, canvasWidth / 2)),
      Math.max(12 + halfToolbar, canvasWidth - halfToolbar - 12),
    );
    const canvasHeight = viewport.height * zoom;
    const placement = above >= 8 || below + 46 > canvasHeight - 8 ? 'above' : 'below';
    return {
      left,
      top: Math.max(8, placement === 'above' ? above : below),
      placement,
    } as const;
  }, [canvasState, selectedNodeId]);

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
      setLayerDropValidation(null);
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
      setLayerDropValidation(
        state.intent ? (editorRef.current?.validateMove(state.intent) ?? null) : null,
      );
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
        if (intent) {
          const validation = editorRef.current?.validateMove(intent);
          if (validation?.valid) editorRef.current?.moveNode(intent);
          else if (validation?.reason) setNotice(validation.reason);
        }
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
    return () => {
      if (previewFrameRef.current !== null) {
        window.cancelAnimationFrame(previewFrameRef.current);
        previewFrameRef.current = null;
      }
      previewWindowRef.current = null;
      previewSnapshotRef.current = null;
    };
  }, []);

  useEffect(() => {
    const cancelTemporaryInteraction = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setQuickAddTarget(null);
      layerPointerCleanupRef.current?.();
    };
    window.addEventListener('keydown', cancelTemporaryInteraction);
    return () => window.removeEventListener('keydown', cancelTemporaryInteraction);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadBuilder() {
      setLoadState('loading');
      setError(null);
      try {
        const [
          pageResponse,
          versionsResponse,
          assetsResponse,
          siteResponse,
          reusablesResponseRaw,
          designSystemResponseRaw,
          previewResponseRaw,
          headerLayoutsResponseRaw,
          footerLayoutsResponseRaw,
        ] = await Promise.all([
          api.get(`/pages/${pageId}`),
          api.get(`/pages/${pageId}/versions?limit=100`),
          api.get(`/workspaces/${workspaceId}/assets?limit=100`),
          api.get(`/workspaces/${workspaceId}/sites/${siteId}`),
          api
            .get(`/workspaces/${workspaceId}/sites/${siteId}/reusables?limit=100`)
            .catch((caughtError: unknown) => {
              if (caughtError instanceof ApiClientError && caughtError.status === 404) {
                return null;
              }
              throw caughtError;
            }),
          api
            .get(`/workspaces/${workspaceId}/sites/${siteId}/design-system`)
            .catch((caughtError: unknown) => {
              if (caughtError instanceof ApiClientError && caughtError.status === 404) {
                return null;
              }
              throw caughtError;
            }),
          api.get(`/preview/pages/${pageId}`).catch(() => null),
          api.get(`/sites/${siteId}/layouts/headers`).catch(() => null),
          api.get(`/sites/${siteId}/layouts/footers`).catch(() => null),
        ]);
        if (cancelled) return;

        const nextPage = PageSchema.parse(pageResponse);
        const nextSite = SiteSchema.parse(siteResponse);
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
        setSiteContext({
          name: nextSite.name,
          ...(nextSite.logo ? { logo: nextSite.logo } : {}),
        });
        setVersion(PageVersionSchema.parse(nextVersion));
        setPageDocument(createPageDocument(nextPayload));
        setAssets(AssetListResponseSchema.parse(assetsResponse).items);
        const nextReusables = reusablesResponseRaw
          ? ReusableListResponseSchema.parse(reusablesResponseRaw).items
          : [];
        setReusables(nextReusables);
        const preview = previewResponseRaw
          ? PublicPageSchema.safeParse(previewResponseRaw)
          : undefined;
        const previewNavigation = preview?.success ? preview.data.navigation : undefined;
        setNavigation({
          ...(previewNavigation?.main ? { main: previewNavigation.main } : {}),
          ...(previewNavigation?.footer ? { footer: previewNavigation.footer } : {}),
        });
        setPreviewExtensions(preview?.success ? (preview.data.extensions ?? []) : []);
        setReusableRuntime(
          preview?.success && preview.data.reusables?.length
            ? preview.data.reusables
            : nextReusables.map((reusable) => ({
                id: reusable.id,
                document: reusable.draft,
              })),
        );
        const nextEditingReusable = initialReusableId
          ? nextReusables.find((reusable) => reusable.id === initialReusableId)
          : undefined;
        if (nextEditingReusable) {
          const editorDocument = reusableDocumentToEditorPageDocument(
            nextEditingReusable.draft,
          );
          setReusableEditorDocument(editorDocument.document);
          setReusableEditorWrappedSource(editorDocument.wrappedSource);
        }
        setDesignSystem(
          designSystemResponseRaw
            ? SiteDesignSystemResponseSchema.parse(designSystemResponseRaw).draft
            : createDefaultSiteDesignSystem(),
        );
        const layoutResources = [
          ...(headerLayoutsResponseRaw
            ? LayoutExtensionListResponseSchema.parse(headerLayoutsResponseRaw).items
            : []),
          ...(footerLayoutsResponseRaw
            ? LayoutExtensionListResponseSchema.parse(footerLayoutsResponseRaw).items
            : []),
        ];
        const loadedLayoutExtensions = await Promise.all(
          layoutResources.map(async (resource) => {
            try {
              const versionsResponse = LayoutExtensionVersionsResponseSchema.parse(
                await api.get(
                  `/sites/${siteId}/layouts/${resource.kind === 'header' ? 'headers' : 'footers'}/${resource.id}/versions`,
                ),
              );
              const versionId = resource.draftVersionId ?? resource.publishedVersionId;
              const version = versionId
                ? versionsResponse.items.find((candidate) => candidate.id === versionId)
                : versionsResponse.items[0];
              if (!version) return null;
              return {
                resource,
                document: SiteGlobalPayloadV1Schema.parse(version.document),
              };
            } catch {
              return null;
            }
          }),
        );
        if (cancelled) return;
        setLayoutExtensions(
          loadedLayoutExtensions.filter(
            (
              item,
            ): item is {
              resource: LayoutExtensionResource;
              document: SiteGlobalPayloadV1;
            } => item !== null,
          ),
        );
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
  }, [initialReusableId, pageId, router, siteId, workspaceId]);

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

  function postPreviewSnapshot(overrides: Partial<PagePreviewSnapshot> = {}) {
    let nextSnapshot: PagePreviewSnapshot | null = null;
    try {
      const editorCandidate = !isEditingReusable
        ? editorRef.current?.getDocument()
        : undefined;
      const candidate =
        overrides.page ??
        (editorCandidate && 'schemaVersion' in editorCandidate
          ? editorCandidate
          : pageDocument);
      if (!candidate) return;
      nextSnapshot = {
        page: candidate,
        navigation: overrides.navigation ?? navigation,
        extensions: overrides.extensions ?? previewExtensions,
        reusables: overrides.reusables ?? reusableRuntime,
        designSystem: overrides.designSystem ?? designSystem,
      };
      previewSnapshotRef.current = nextSnapshot;
    } catch {
      previewWindowRef.current = null;
      previewSnapshotRef.current = null;
      return;
    }
    const previewWindow = previewWindowRef.current;
    if (!previewWindow || previewWindow.closed) return;
    if (previewFrameRef.current !== null) return;
    previewFrameRef.current = window.requestAnimationFrame(() => {
      previewFrameRef.current = null;
      const target = previewWindowRef.current;
      const latestSnapshot = previewSnapshotRef.current;
      if (!target || target.closed || !latestSnapshot) return;
      try {
        target.postMessage(
          { type: PAGE_PREVIEW_MESSAGE_TYPE, snapshot: latestSnapshot },
          rendererOrigin,
        );
      } catch {
        previewWindowRef.current = null;
      }
    });
  }

  function handleDocumentChange(document: unknown): void {
    if (!document || typeof document !== 'object' || !('schemaVersion' in document)) {
      return;
    }
    const pageDocument = document as PageDocument;
    if (isEditingReusable) setReusableEditorDocument(pageDocument);
    else {
      setPageDocument(pageDocument);
      postPreviewSnapshot({ page: pageDocument });
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
    postPreviewSnapshot();
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
      postPreviewSnapshot();
    }
    window.addEventListener('message', handlePreviewMessage);
    return () => window.removeEventListener('message', handlePreviewMessage);
  }, []);

  async function saveDraft(): Promise<SaveDraftResult> {
    if (!editorRef.current || saveInFlightRef.current) {
      return false;
    }
    const blockingIssue = validationIssuesRef.current.find(
      (issue) => issue.severity === 'error',
    );
    if (blockingIssue) {
      setSaveStatus('validation');
      setError(null);
      setNotice(null);
      await validationCoordinatorRef.current?.focusIssue(blockingIssue);
      return false;
    }
    saveInFlightRef.current = true;
    setSaveInFlight(true);
    setSaveStatus('saving');
    setError(null);
    setNotice(null);
    try {
      const nextDocument = editorRef.current?.getDocument();
      if (isEditingReusable) {
        if (!nextDocument) throw new Error('Reusable editor document is unavailable');
        if (!('schemaVersion' in nextDocument)) {
          throw new Error('Invalid reusable editor document');
        }
        const nextReusableDocument = editorPageDocumentToReusableDocument(
          nextDocument,
          reusableEditorWrappedSource,
        );
        const updated = ReusableComponentSchema.parse(
          await api.patch(
            `/workspaces/${workspaceId}/sites/${siteId}/reusables/${editingReusableId}`,
            { document: nextReusableDocument },
          ),
        );
        setReusables((current) =>
          current.map((reusable) => (reusable.id === updated.id ? updated : reusable)),
        );
        const nextReusableRuntime = reusableRuntime.map((runtime) =>
          runtime.id === updated.id
            ? { id: updated.id, document: updated.draft }
            : runtime,
        );
        setReusableRuntime(nextReusableRuntime);
        postPreviewSnapshot({ reusables: nextReusableRuntime });
        setReusableEditorDocument(nextDocument);
        editorRef.current?.acknowledgeSaved(nextDocument.payload);
        validationCoordinatorRef.current?.clearResolvedIssues();
        setSaveStatus('saved');
        setNotice(
          `Saved reusable source “${updated.name}”. Publish the site to make it public.`,
        );
        return true;
      }
      if (!version) return false;
      if (!nextDocument) throw new Error('Page editor document is unavailable');
      if (!('schemaVersion' in nextDocument))
        throw new Error('Invalid page editor document');
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
      const currentDocument = editorRef.current?.getDocument();
      if (!currentDocument) throw new Error('Page editor document is unavailable');
      const currentPayloadResult = PagePayloadSchema.safeParse(
        'schemaVersion' in currentDocument ? currentDocument.payload : undefined,
      );
      const hasNewerPayloadChanges =
        !currentPayloadResult.success ||
        JSON.stringify(currentPayloadResult.data) !== JSON.stringify(nextPayload);
      setVersion(nextVersion);
      editorRef.current?.acknowledgeSaved(nextPayload);
      validationCoordinatorRef.current?.clearResolvedIssues();
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
      return true;
    } catch (caughtError) {
      if (caughtError instanceof ApiClientError && caughtError.status === 409) {
        setSaveStatus('conflict');
        setError(
          'This draft was changed elsewhere. Reload the latest draft before saving again.',
        );
        return false;
      }
      if (
        caughtError instanceof BuilderAdapterError ||
        (caughtError &&
          typeof caughtError === 'object' &&
          Array.isArray((caughtError as { issues?: unknown }).issues))
      ) {
        showValidationIssue(
          validationIssueFromError(caughtError, {
            scope: scopeForDocumentKind(
              documentKindRef.current,
              Boolean(editingReusableIdRef.current),
            ),
            tab: 'content',
          }),
          true,
        );
        return false;
      }
      if (caughtError instanceof ApiClientError && caughtError.status < 500) {
        showValidationIssue(
          createBuilderValidationIssue({
            scope: scopeForDocumentKind(
              documentKindRef.current,
              Boolean(editingReusableIdRef.current),
            ),
            code: caughtError.code,
            message: caughtError.message,
            tab: 'content',
          }),
          false,
        );
        return false;
      }
      setSaveStatus('error');
      setError(toErrorMessage(caughtError));
      return false;
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
      if (isEditingReusable) {
        await api.post(`/workspaces/${workspaceId}/sites/${siteId}/publish`, {});
        setReusables((current) =>
          current.map((reusable) =>
            reusable.id === editingReusableId
              ? { ...reusable, published: reusable.draft }
              : reusable,
          ),
        );
        validationCoordinatorRef.current?.clearResolvedIssues();
        setNotice(
          'Site published. The public site now uses the published reusable source.',
        );
        return;
      }
      const updated = PageSchema.parse(await api.post(`/pages/${pageId}/publish`, {}));
      setPage(updated);
      validationCoordinatorRef.current?.clearResolvedIssues();
      setNotice('Page published. The public site now uses the published snapshot.');
    } catch (caughtError) {
      if (caughtError instanceof ApiClientError && caughtError.status < 500) {
        showValidationIssue(
          createBuilderValidationIssue({
            scope: scopeForDocumentKind(
              documentKindRef.current,
              Boolean(editingReusableIdRef.current),
            ),
            code: caughtError.code,
            message: caughtError.message,
            tab: 'content',
          }),
          true,
        );
        return;
      }
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

  async function editReusableSource(reusableId: string): Promise<void> {
    if (reusableId === editingReusableId) return;
    if (isDirty && !window.confirm('Save this document before switching?')) return;
    if (isDirty && !(await saveDraft())) return;
    const reusable = reusables.find((candidate) => candidate.id === reusableId);
    if (!reusable) {
      setNotice('The reusable source is no longer available. Refresh the library.');
      return;
    }
    const editorDocument = reusableDocumentToEditorPageDocument(reusable.draft);
    setEditingReusableId(reusable.id);
    setReusableEditorDocument(editorDocument.document);
    setReusableEditorWrappedSource(editorDocument.wrappedSource);
    setSelected(null);
    setSelectedNodeId(null);
    setCanvasState(null);
    setHistory({ canUndo: false, canRedo: false });
    setAddPanelTab('layouts');
    setAddPanelTabTouched(true);
    setSaveStatus('initializing');
    setNotice(`Editing reusable source “${reusable.name}”.`);
  }

  async function exitReusableSource(): Promise<void> {
    if (!isEditingReusable) return;
    if (isDirty && !window.confirm('Save this reusable source before switching?')) return;
    if (isDirty && !(await saveDraft())) return;
    setEditingReusableId(null);
    setReusableEditorDocument(null);
    setSelected(null);
    setSelectedNodeId(null);
    setCanvasState(null);
    setHistory({ canUndo: false, canRedo: false });
    setSaveStatus('initializing');
    setNotice('Returned to the page document.');
  }

  function changeViewport(nextViewport: BuilderViewport) {
    viewportChangingRef.current = true;
    editorRef.current?.setViewport(nextViewport);
    setViewport(nextViewport);
    window.setTimeout(() => {
      viewportChangingRef.current = false;
    }, 1_000);
  }

  function switchValidationDocument(scope: BuilderValidationScope): Promise<void> | void {
    // Header and Footer validation belongs to their dedicated resource builder.
    // This page-only shell can only focus page-level validation issues.
    if (scope !== 'page') return;
  }

  function openValidationInspector(
    tab?: InspectorTab,
    section?: string,
    partName?: string,
  ): void {
    if (tab) setInspectorTab(tab);
    if (partName) setFocusPartName(partName);
    const sections: readonly InspectorSectionKey[] = [
      'content',
      'layout',
      'size',
      'spacing',
      'typography',
      'background',
      'border',
      'effects',
      'advanced',
    ];
    if (section && sections.includes(section as InspectorSectionKey)) {
      setOpenInspectorSections((current) => ({
        ...current,
        [section]: true,
      }));
    }
  }

  if (!validationCoordinatorRef.current) {
    validationCoordinatorRef.current = createBuilderValidationCoordinator({
      getIssues: () => validationIssuesRef.current,
      setIssues: (nextIssues) => {
        validationIssuesRef.current = nextIssues;
        setValidationIssues(nextIssues);
      },
      navigation: {
        openInspector: openValidationInspector,
        selectNode: (nodeId) => editorRef.current?.selectNode(nodeId),
        switchDocument: switchValidationDocument,
        switchViewport: changeViewport,
      },
    });
  }

  function updateValidationIssue(issue: BuilderValidationIssue | null, issueId?: string) {
    const current = validationIssuesRef.current;
    const next = issue
      ? dedupeBuilderValidationIssues([
          ...current.filter((candidate) => candidate.id !== issue.id),
          issue,
        ])
      : current.filter((candidate) => candidate.id !== issueId);
    const sorted = sortBuilderValidationIssues(next, {
      nodeId: selectedNodeId,
      scope: scopeForDocumentKind(
        documentKindRef.current,
        Boolean(editingReusableIdRef.current),
      ),
      viewport,
    });
    validationIssuesRef.current = sorted;
    setValidationIssues(sorted);
    if (issue?.severity === 'error') {
      setSaveStatus('validation');
    }
    if (!issue && sorted.length === 0) {
      setSaveStatus((current) => (current === 'validation' ? 'unsaved' : current));
    }
  }

  function showValidationIssue(issue: BuilderValidationIssue, focus = false): void {
    updateValidationIssue(issue);
    setSaveStatus('validation');
    setError(null);
    if (focus) window.setTimeout(() => focusValidationIssue(issue), 0);
  }

  function focusValidationIssue(issue: BuilderValidationIssue): void {
    void validationCoordinatorRef.current?.focusIssue(issue);
  }

  function openQuickAdd() {
    if (!selected) return;
    setQuickAddTarget({
      targetNodeId: selected.id,
      position: selected.type === 'root' ? 'inside' : 'after',
    });
  }

  function insertQuickAdd(type: BuilderInsertable) {
    if (!quickAddTarget) return;
    const changed = editorRef.current?.insertBlock(type, quickAddTarget);
    if (changed) {
      setQuickAddTarget(null);
    } else {
      setNotice('That component is not allowed at this insertion point.');
    }
  }

  function insertSavedReusable(reusableId: string, mode: 'copy' | 'linked') {
    const changed = editorRef.current?.insertReusable(reusableId, mode);
    if (changed) {
      setNotice(
        `${mode === 'linked' ? 'Linked' : 'Copied'} reusable section into the page.`,
      );
    } else {
      setNotice('That reusable section is not allowed at this insertion point.');
    }
  }

  function openSaveSelectedAsReusable() {
    const document = editorRef.current?.getSelectedReusableDocument();
    if (!document) {
      setNotice('Select a normal section or component before saving it as reusable.');
      return;
    }
    setReusableSaveDraft({ document, name: '', description: '' });
  }

  async function saveSelectedAsReusable() {
    if (!reusableSaveDraft || !reusableSaveDraft.name.trim()) return;
    setReusableSaveInFlight(true);
    try {
      const rootType =
        reusableSaveDraft.document.root.type === 'section' ? 'section' : 'component';
      const created = await api.post(
        `/workspaces/${workspaceId}/sites/${siteId}/reusables`,
        {
          name: reusableSaveDraft.name.trim(),
          ...(reusableSaveDraft.description.trim()
            ? { description: reusableSaveDraft.description.trim() }
            : {}),
          kind: rootType,
          document: reusableSaveDraft.document,
        },
      );
      const reusable = ReusableComponentSchema.parse(created);
      setReusables((current) => [reusable, ...current]);
      setReusableRuntime((current) => [
        { id: reusable.id, document: reusable.draft },
        ...current.filter((candidate) => candidate.id !== reusable.id),
      ]);
      setReusableSaveDraft(null);
      setNotice(`Saved “${reusable.name}” to the reusable library.`);
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    } finally {
      setReusableSaveInFlight(false);
    }
  }

  async function renameReusable(reusable: ReusableComponent): Promise<void> {
    const name = window.prompt('Rename reusable section', reusable.name)?.trim();
    if (!name || name === reusable.name) return;
    try {
      const updated = ReusableComponentSchema.parse(
        await api.patch(
          `/workspaces/${workspaceId}/sites/${siteId}/reusables/${reusable.id}`,
          { name },
        ),
      );
      setReusables((current) =>
        current.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
      );
      setNotice(`Renamed reusable source to “${updated.name}”.`);
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    }
  }

  async function archiveReusable(reusable: ReusableComponent): Promise<void> {
    if (
      !window.confirm(
        `Archive “${reusable.name}”? Existing linked instances will keep their source snapshot.`,
      )
    ) {
      return;
    }
    try {
      await api.delete(
        `/workspaces/${workspaceId}/sites/${siteId}/reusables/${reusable.id}`,
      );
      setReusables((current) =>
        current.filter((candidate) => candidate.id !== reusable.id),
      );
      setNotice(`Archived “${reusable.name}”. Existing links remain resolvable.`);
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    }
  }

  function detachSelectedReusable() {
    if (selected?.type !== 'reusable-instance') return;
    const reusableId = selected.props.reusableId;
    if (typeof reusableId !== 'string') return;
    const reusable = reusables.find((candidate) => candidate.id === reusableId);
    if (!reusable || !editorRef.current?.detachSelectedReusable(reusable.draft)) {
      setNotice('The reusable source is unavailable, so it cannot be detached.');
      return;
    }
    setNotice(
      `Detached “${reusable.name}”; future source edits no longer affect this copy.`,
    );
  }

  function updateSelectedStyle(property: string, value: string | StyleTokenReference) {
    editorRef.current?.updateSelectedStyle(property, value);
  }

  function resetSelectedStyle(property: string) {
    editorRef.current?.resetSelectedStyle(property);
  }

  function updateSelectedPartStyle(
    partName: string,
    property: string,
    value: string | StyleTokenReference,
  ) {
    editorRef.current?.updateSelectedPartStyle(partName, property, value);
  }

  function resetSelectedPartStyle(partName: string, property: string) {
    editorRef.current?.resetSelectedPartStyle(partName, property);
  }

  function toggleInspectorSection(section: InspectorSectionKey, open: boolean) {
    setOpenInspectorSections((current) => ({ ...current, [section]: open }));
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

  if (!activePayload) {
    return (
      <main className="builder-loading" aria-busy="true">
        <span className="eyebrow">Visual builder</span>
        <h1>Loading draft…</h1>
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
            <h1>{isEditingReusable ? editingReusable.name : page.name}</h1>
            <code className="builder-page-path">
              {isEditingReusable ? `Reusable source · ${siteId}` : page.path}
            </code>
          </div>
        </div>
        <div className="builder-actions">
          {isEditingReusable ? (
            <button
              aria-label="Back to page document"
              className="button button-small button-ghost"
              onClick={() => void exitReusableSource()}
              type="button"
            >
              ← Page
            </button>
          ) : null}
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
                  ? isEditingReusable
                    ? `Saved · reusable draft · ${editingReusable?.published ? 'published' : 'not published'}`
                    : `Saved · v${version.versionNumber} · not published`
                  : saveStatus === 'conflict'
                    ? 'Conflict'
                    : saveStatus === 'validation'
                      ? 'Needs attention'
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
              saveStatus === 'validation' ||
              saveStatus === 'conflict'
            }
            onClick={() => void publishPage()}
            type="button"
          >
            {isEditingReusable ? 'Publish site' : 'Publish'}
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
      <BuilderValidationNavigator
        issues={validationIssues}
        nodeLabels={
          new Map((canvasState?.nodes ?? []).map((node) => [node.id, node.label]))
        }
        onFocusIssue={focusValidationIssue}
      />

      <div
        className={`builder-workspace builder-workspace-v2${leftPanelCollapsed ? ' is-left-collapsed' : ''}${rightPanelCollapsed ? ' is-right-collapsed' : ''}`}
        data-left-panel-width={panelWidths.left}
        data-right-panel-width={panelWidths.right}
        style={
          {
            '--builder-left-panel-width': `${panelWidths.left}px`,
            '--builder-right-panel-width': `${panelWidths.right}px`,
          } as CSSProperties
        }
      >
        {panelResizeActive ? (
          <div
            aria-hidden="true"
            className={`builder-resize-shield is-${panelResizeActive}-active`}
          />
        ) : null}
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
                ['settings', '⚙', 'Page settings'],
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
                <span>{label.replace(' blocks', '')}</span>
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
          <aside className="builder-panel builder-blocks-panel" data-panel="left">
            {activeTool === 'add' ? (
              <>
                <div className="builder-panel-heading">
                  <span className="eyebrow">Components</span>
                  <strong>Add to page</strong>
                </div>
                <div
                  aria-label="Add component type"
                  className="builder-add-tabs"
                  role="tablist"
                >
                  {(['layouts', 'elements', 'saved', 'templates'] as const).map((tab) => (
                    <button
                      aria-selected={addPanelTab === tab}
                      className={addPanelTab === tab ? 'is-active' : undefined}
                      disabled={isEditingReusable && tab === 'saved'}
                      key={tab}
                      onClick={() => {
                        setAddPanelTab(tab);
                        setAddPanelTabTouched(true);
                      }}
                      role="tab"
                      type="button"
                    >
                      {tab === 'layouts'
                        ? 'Layouts'
                        : tab === 'elements'
                          ? 'Elements'
                          : tab === 'saved'
                            ? 'Saved'
                            : 'Templates'}
                    </button>
                  ))}
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
                {addPanelTab === 'saved' &&
                documentKind === 'page' &&
                !isEditingReusable ? (
                  <div className="builder-block-list" data-catalog-tab="saved">
                    {reusables
                      .filter((reusable) => {
                        const query = blockQuery.trim().toLowerCase();
                        return (
                          !query ||
                          reusable.name.toLowerCase().includes(query) ||
                          reusable.description?.toLowerCase().includes(query)
                        );
                      })
                      .map((reusable) => (
                        <BuilderBlockCard
                          addLabel={`Copy ${reusable.name}`}
                          category="saved"
                          dataBlockType={reusable.id}
                          description={
                            reusable.description ?? 'Reusable section from this site.'
                          }
                          dragLabel={`Copy ${reusable.name} to canvas`}
                          key={reusable.id}
                          label={reusable.name}
                          onAdd={() => insertSavedReusable(reusable.id, 'copy')}
                          onDragStart={undefined}
                          preview={resolveBuilderPreview(
                            reusableDocumentToEditorDefinition(reusable.draft),
                            `reusable-${reusable.id}`,
                          )}
                          secondaryActions={[
                            {
                              label: 'Link',
                              onClick: () => insertSavedReusable(reusable.id, 'linked'),
                            },
                            {
                              label: 'Edit source',
                              onClick: () => void editReusableSource(reusable.id),
                            },
                            {
                              label: 'Rename',
                              onClick: () => void renameReusable(reusable),
                            },
                            {
                              label: 'Archive',
                              onClick: () => void archiveReusable(reusable),
                            },
                          ]}
                        />
                      ))}
                    {reusables.length === 0 ? (
                      <p className="muted small builder-empty-message">
                        No saved sections yet. Select a page element and use “Save as
                        reusable”.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {addPanelTab === 'templates' ? (
                  <div className="builder-block-list" data-catalog-tab="templates">
                    {BUILT_IN_TEMPLATE_REGISTRY.filter((block) => {
                      const query = blockQuery.trim().toLowerCase();
                      return (
                        !query ||
                        block.name.toLowerCase().includes(query) ||
                        block.description.toLowerCase().includes(query) ||
                        block.keywords.some((keyword) => keyword.includes(query))
                      );
                    }).map((block) => {
                      return (
                        <BuilderBlockCard
                          addLabel={`${block.name} template add`}
                          category="template"
                          dataBlockType={block.id}
                          description={block.description}
                          dragLabel={`Add ${block.name} template`}
                          key={block.id}
                          label={block.name}
                          onAdd={() => editorRef.current?.addBlock(block.sourcePreset)}
                          onDragStart={undefined}
                          preview={block.preview}
                        />
                      );
                    })}
                  </div>
                ) : null}
                {addPanelTab !== 'saved' && addPanelTab !== 'templates' ? (
                  <div className="builder-block-list">
                    {toolBlockGroups.map((group) => (
                      <section className="builder-block-category" key={group.category}>
                        <h2 className="builder-block-category-heading">
                          {blockGroupLabels[group.category]}
                        </h2>
                        {group.options.map((block) => {
                          const insertable =
                            block.globalPresetId ?? block.presetId ?? block.type;
                          if (!insertable && !block.extensionId && !block.layoutExtension)
                            return null;
                          const dataBlockType =
                            block.layoutExtension?.resource.id ?? insertable;
                          return (
                            <BuilderBlockCard
                              addLabel={`${block.label}${
                                block.kind === 'preset' && block.label.endsWith('Section')
                                  ? ' preset'
                                  : ''
                              } add`}
                              category={block.category}
                              dataBlockType={dataBlockType}
                              description={block.description}
                              dragLabel={`${block.extensionId ? 'Add' : 'Drag'} ${block.label} block`}
                              key={`${dataBlockType ?? 'extension'}:${block.extensionId ?? ''}`}
                              label={block.label}
                              onAdd={() =>
                                block.layoutExtension
                                  ? editorRef.current?.addLayoutExtension(
                                      block.layoutExtension.document,
                                    )
                                  : block.extensionId
                                    ? editorRef.current?.addExtensionBlock(
                                        block.extensionId,
                                      )
                                    : insertable
                                      ? editorRef.current?.addBlock(
                                          insertable as BuilderInsertable,
                                        )
                                      : undefined
                              }
                              onDragStart={
                                block.layoutExtension
                                  ? (event) =>
                                      editorRef.current?.startLayoutExtensionDrag(
                                        block.layoutExtension!.document,
                                        event.nativeEvent,
                                      )
                                  : block.extensionId || !insertable
                                    ? undefined
                                    : (event) =>
                                        editorRef.current?.startBlockDrag(
                                          insertable as BuilderInsertable,
                                          event.nativeEvent,
                                        )
                              }
                              preview={block.preview}
                            />
                          );
                        })}
                      </section>
                    ))}
                  </div>
                ) : null}
                {toolBlockOptions.length === 0 ? (
                  <p className="muted small builder-empty-message">
                    No matching components.
                  </p>
                ) : null}
                <p className="muted small builder-help">
                  Components are versioned PagePayload nodes and keep their canvas order
                  when published. Header/Footer extensions are copied into this page, so
                  later source edits do not change the page snapshot.
                </p>
              </>
            ) : null}
            {activeTool === 'settings' ? (
              <>
                <div className="builder-layers-section builder-page-capabilities">
                  <div className="builder-panel-heading">
                    <div>
                      <span className="eyebrow">Page settings</span>
                      <strong>Extensions</strong>
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
                    <details className="builder-page-settings-advanced">
                      <summary>Technical capability details</summary>
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
                    </details>
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
                {imageAssets.length ? (
                  <div className="builder-asset-list">
                    {imageAssets.map((asset) => (
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
            {activeTool === 'layers' ? (
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
                        selectedNodeId ?? undefined,
                        (id) => editorRef.current?.selectNode(id),
                        toggleLayer,
                        handleLayerKeyDown,
                        startLayerDrag,
                        collapsedLayerIds,
                        layerDraggingId,
                        layerDropIntent,
                        layerDropValidation?.valid === false,
                        new Set(
                          validationIssues
                            .filter((issue) => issue.severity === 'error' && issue.nodeId)
                            .map((issue) => issue.nodeId as string),
                        ),
                        focusableLayerId,
                      )
                    ) : (
                      <span className="muted small">Preparing layers…</span>
                    )}
                    {canvasState && visibleLayerIds && visibleLayerIds.size === 0 ? (
                      <span className="muted small">No matching layers.</span>
                    ) : null}
                  </div>
                  {layerDropValidation?.valid === false ? (
                    <p className="builder-drop-status invalid" role="status">
                      Cannot drop here: {layerDropValidation.reason}
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}
          </aside>
        </div>

        {!leftPanelCollapsed ? (
          <BuilderPanelResizer
            onChange={(width) => updatePanelWidth('left', width)}
            onResizeEnd={() => setPanelResizeActive(null)}
            onResizeStart={() => setPanelResizeActive('left')}
            otherPanelWidth={panelWidths.right}
            side="left"
            value={panelWidths.left}
            viewportWidth={builderViewportWidth}
          />
        ) : null}

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
          <div className="builder-editor-shell">
            <BuilderContextToolbar
              onDelete={() => editorRef.current?.deleteSelected()}
              onDuplicate={() => editorRef.current?.duplicateSelected()}
              onMoveDown={() => editorRef.current?.moveSelected('down')}
              onMoveUp={() => editorRef.current?.moveSelected('up')}
              onQuickAdd={openQuickAdd}
              onSaveAsReusable={openSaveSelectedAsReusable}
              onDetachReusable={detachSelectedReusable}
              onSelectParent={() => editorRef.current?.selectParent()}
              position={contextToolbarPosition}
              selected={selected}
            />
            <QuickAddOverlay
              anchor={
                contextToolbarPosition
                  ? {
                      left: contextToolbarPosition.left,
                      top: contextToolbarPosition.top + 48,
                    }
                  : undefined
              }
              onClose={() => setQuickAddTarget(null)}
              onInsert={insertQuickAdd}
              open={quickAddTarget !== null}
              position={quickAddTarget?.position}
              options={visibleBlockOptions
                .filter((option) => option.type !== 'extension')
                .filter(
                  (option) => option.globalPresetId || option.presetId || option.type,
                )
                .map((option) => ({
                  type: (option.globalPresetId ??
                    option.presetId ??
                    option.type) as BuilderInsertable,
                  label: option.label,
                }))}
              targetLabel={selected?.type}
            />
            <GrapesEditor
              documentKind={documentKind}
              initialPayload={activePayload}
              reusableRuntime={reusableRuntime}
              designSystem={designSystem}
              {...(siteContext ? { siteName: siteContext.name } : {})}
              {...(siteContext?.logo ? { siteLogo: siteContext.logo } : {})}
              navigation={navigation}
              validationIssues={validationIssues}
              key={`${editingReusableId ?? documentKind}-${activePayload.root.id}`}
              onDirty={markDirty}
              onDocumentChange={handleDocumentChange}
              onError={(message) => {
                setSaveStatus('error');
                setError(`Editor error: ${message}`);
              }}
              onValidationIssue={(issue) => updateValidationIssue(issue)}
              onHistoryChange={setHistory}
              onCanvasStateChange={setCanvasState}
              onInteractionModeChange={setInteractionMode}
              onReady={() =>
                setSaveStatus((current) =>
                  current === 'initializing' ? 'saved' : current,
                )
              }
              onSelectionChange={(nextSelection) => {
                setSelectedNodeId(nextSelection?.id ?? null);
                setSelected(nextSelection);
              }}
              ref={editorRef}
            />
            <PageMinimap
              onFitPage={() => editorRef.current?.fitCanvas()}
              onNavigate={(x, y) => editorRef.current?.scrollToCanvasPoint(x, y)}
              onSelectNode={(id) => editorRef.current?.selectNode(id)}
              onZoomChange={(zoom) => editorRef.current?.setCanvasZoom(zoom)}
              selectedId={selectedNodeId ?? undefined}
              state={canvasState}
            />
          </div>
        </section>

        {!rightPanelCollapsed ? (
          <BuilderPanelResizer
            onChange={(width) => updatePanelWidth('right', width)}
            onResizeEnd={() => setPanelResizeActive(null)}
            onResizeStart={() => setPanelResizeActive('right')}
            otherPanelWidth={panelWidths.left}
            side="right"
            value={panelWidths.right}
            viewportWidth={builderViewportWidth}
          />
        ) : null}

        <aside
          className={`builder-panel builder-properties-panel${rightPanelCollapsed ? ' is-collapsed' : ''}`}
          data-panel="right"
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
              <BuilderInspector
                inspectorTab={inspectorTab}
                onInspectorTabChange={setInspectorTab}
                onAddStructuralChild={(slotName, childType) =>
                  childType && childType !== 'root' && childType !== 'reusable-instance'
                    ? editorRef.current?.addStructuralChild(
                        slotName,
                        childType as BuilderBlockType,
                      )
                    : undefined
                }
                onMoveStructuralChild={(nodeId, direction) =>
                  editorRef.current?.moveStructuralChild(nodeId, direction)
                }
                onRemoveStructuralChild={(nodeId) =>
                  editorRef.current?.removeStructuralChild(nodeId)
                }
                onDuplicateStructuralChild={(nodeId) =>
                  editorRef.current?.duplicateStructuralChild(nodeId)
                }
                onReorderStructuralChild={(sourceId, targetId, position) =>
                  editorRef.current?.moveNode({
                    nodeId: sourceId,
                    targetNodeId: targetId,
                    position,
                  })
                }
                onSelectNode={(nodeId) => editorRef.current?.selectNode(nodeId)}
                onToggleSection={toggleInspectorSection}
                openSections={openInspectorSections}
                onValidationIssue={updateValidationIssue}
                resetSelectedStyle={resetSelectedStyle}
                selected={selected}
                updateSelectedProperty={(property, value) =>
                  editorRef.current?.updateSelectedProperty(property, value)
                }
                updateSelectedStyle={updateSelectedStyle}
                updateSelectedPartStyle={updateSelectedPartStyle}
                resetSelectedPartStyle={resetSelectedPartStyle}
                validationIssues={validationIssues}
                validationScope={scopeForDocumentKind(
                  documentKind,
                  Boolean(editingReusableId),
                )}
                focusPartName={focusPartName}
                usableAssets={usableAssets}
                designSystem={designSystem}
                navigationItemCount={navigation.main?.length ?? 0}
                onEditNavigation={() =>
                  router.push(`/?view=navigation&siteId=${encodeURIComponent(siteId)}`)
                }
                viewport={viewport}
              />
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
      {reusableSaveDraft ? (
        <div className="builder-dialog-backdrop" role="presentation">
          <section
            aria-labelledby="save-reusable-title"
            aria-modal="true"
            className="builder-dialog"
            role="dialog"
          >
            <div className="builder-panel-heading">
              <span className="eyebrow">Saved library</span>
              <h2 id="save-reusable-title">Save as reusable</h2>
            </div>
            <p className="muted small">
              Reuse this validated component tree as a copy or a linked source.
            </p>
            <BuilderBlockPreview
              label="Selected reusable preview"
              preview={resolveBuilderPreview(
                reusableDocumentToEditorDefinition(reusableSaveDraft.document),
                'selected-reusable',
              )}
            />
            <label className="form-field">
              <span>Name *</span>
              <input
                autoFocus
                onChange={(event) =>
                  setReusableSaveDraft((current) =>
                    current ? { ...current, name: event.target.value } : current,
                  )
                }
                placeholder="Company Hero"
                value={reusableSaveDraft.name}
              />
            </label>
            <label className="form-field">
              <span>Description</span>
              <textarea
                onChange={(event) =>
                  setReusableSaveDraft((current) =>
                    current ? { ...current, description: event.target.value } : current,
                  )
                }
                placeholder="A shared hero section for marketing pages"
                rows={3}
                value={reusableSaveDraft.description}
              />
            </label>
            <div className="builder-dialog-actions">
              <button
                className="button button-ghost"
                disabled={reusableSaveInFlight}
                onClick={() => setReusableSaveDraft(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="button button-primary"
                disabled={reusableSaveInFlight || !reusableSaveDraft.name.trim()}
                onClick={() => void saveSelectedAsReusable()}
                type="button"
              >
                {reusableSaveInFlight ? 'Saving…' : 'Save reusable'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
