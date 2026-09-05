'use client';

import {
  AssetListResponseSchema,
  ExtensionListResponseSchema,
  LayoutExtensionResourceSchema,
  LayoutExtensionVersionsResponseSchema,
  PAGE_COMPONENT_REGISTRY,
  SiteDesignSystemResponseSchema,
  SiteGlobalPayloadV1Schema,
  SiteSchema,
  createDefaultSiteDesignSystem,
  type Asset,
  type BuilderDocumentKind,
  type ExtensionDescriptor,
  type LayoutExtensionResource,
  type LayoutExtensionVersion,
  type SiteDesignSystem,
  type SiteGlobalPayloadV1,
  type StyleTokenReference,
  builderPreviewForComponent,
} from '@payload/contracts';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
} from 'react';

import { cmsViewPath, pagePath } from '../app/cms-routes';
import { ApiClientError, api } from '../app/lib/api';
import { Icon } from '../app/ui/icons';
import {
  GLOBAL_FOOTER_PRESET_REGISTRY,
  GLOBAL_HEADER_PRESET_REGISTRY,
  type BuilderInsertable,
} from './block-presets';
import { BuilderBlockCard } from './builder-block-catalog';
import { type BuilderViewport } from './builder-adapter';
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
  BUILDER_PANEL_DEFAULT_WIDTHS,
  normalizePanelWidths,
  persistPanelWidths,
  readPanelWidths,
  type BuilderPanelSide,
  type BuilderPanelWidths,
} from './builder-panel-size';
import { BuilderPanelResizer } from './builder-panel-resizer';
import { BuilderContextToolbar } from './canvas/builder-context-toolbar';
import { QuickAddOverlay } from './canvas/quick-add-overlay';
import {
  BuilderInspector,
  type InspectorSectionKey,
  type InspectorTab,
} from './inspector/builder-inspector';

type LayoutKindSegment = 'headers' | 'footers';
type SaveStatus = 'loading' | 'saved' | 'unsaved' | 'saving' | 'error' | 'conflict';
type BuilderTool = 'add' | 'layers' | 'assets' | 'settings';
type AddPanelTab = 'layouts' | 'elements' | 'saved' | 'templates';

type LayoutBlockOption = {
  id: BuilderInsertable;
  extensionId?: string;
  label: string;
  description: string;
  preview: ComponentProps<typeof BuilderBlockCard>['preview'];
  category: 'layout' | 'content' | 'preset';
};

const inspectorSections: Record<InspectorSectionKey, boolean> = {
  content: true,
  layout: true,
  size: false,
  spacing: false,
  typography: false,
  background: false,
  border: false,
  effects: false,
  advanced: false,
};

const rendererBaseUrl =
  process.env.NEXT_PUBLIC_RENDERER_BASE_URL ?? 'http://127.0.0.1:3002';

function layoutDocumentKind(
  kind: LayoutKindSegment,
): Exclude<BuilderDocumentKind, 'page'> {
  return kind === 'headers' ? 'site-header' : 'site-footer';
}

function layoutKindLabel(kind: LayoutKindSegment): string {
  return kind === 'headers' ? 'Header' : 'Footer';
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  return error instanceof Error ? error.message : 'The layout builder could not load.';
}

function documentFor(
  resource: LayoutExtensionResource,
  versions: LayoutExtensionVersion[],
): SiteGlobalPayloadV1 | null {
  const versionId = resource.draftVersionId ?? resource.publishedVersionId;
  const version = versionId
    ? versions.find((candidate) => candidate.id === versionId)
    : undefined;
  return version ? SiteGlobalPayloadV1Schema.parse(version.document) : null;
}

function renderLayoutLayers(
  nodes: BuilderCanvasNode[],
  parentId: string | undefined,
  selectedId: string | null,
  collapsedIds: ReadonlySet<string>,
  onSelect: (id: string) => void,
  onToggle: (id: string) => void,
): ReactNode {
  return nodes
    .filter((node) => node.parentId === parentId)
    .map((node) => {
      const children = nodes.filter((candidate) => candidate.parentId === node.id);
      const hasChildren = children.length > 0;
      return (
        <div
          className="builder-layer-node"
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
              {hasChildren ? (
                <Icon name={collapsedIds.has(node.id) ? 'chevronRight' : 'chevronDown'} />
              ) : (
                <Icon name="grip" size={12} />
              )}
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
              <span aria-hidden="true" className="builder-layer-icon">
                {node.type === 'root' ? '▣' : node.type === 'section' ? '▤' : '▪'}
              </span>
              <span className="builder-layer-label">{node.label}</span>
            </button>
          </div>
          {hasChildren && !collapsedIds.has(node.id) ? (
            <div className="builder-layer-children">
              {renderLayoutLayers(
                nodes,
                node.id,
                selectedId,
                collapsedIds,
                onSelect,
                onToggle,
              )}
            </div>
          ) : null}
        </div>
      );
    });
}

export default function LayoutBuilderShell({
  workspaceId,
  siteId,
  layoutId,
  layoutKind,
}: {
  workspaceId: string;
  /** Optional site preview context. The layout source itself is workspace-scoped. */
  siteId?: string;
  layoutId: string;
  layoutKind: LayoutKindSegment;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const previewSiteId = siteId ?? searchParams.get('siteId') ?? undefined;
  const editorRef = useRef<GrapesEditorHandle>(null);
  const [resource, setResource] = useState<LayoutExtensionResource | null>(null);
  const [versions, setVersions] = useState<LayoutExtensionVersion[]>([]);
  const [document, setDocument] = useState<SiteGlobalPayloadV1 | null>(null);
  const [siteName, setSiteName] = useState('');
  const [siteLogo, setSiteLogo] = useState<string | undefined>();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [customExtensions, setCustomExtensions] = useState<ExtensionDescriptor[]>([]);
  const [designSystem, setDesignSystem] = useState<SiteDesignSystem>(
    createDefaultSiteDesignSystem(),
  );
  const [selected, setSelected] = useState<SelectedBuilderNode | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [canvasState, setCanvasState] = useState<BuilderCanvasState | null>(null);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('select');
  const [viewport, setViewport] = useState<BuilderViewport>('desktop');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('content');
  const [openSections, setOpenSections] = useState(inspectorSections);
  const [activeTool, setActiveTool] = useState<BuilderTool>('add');
  const [addPanelTab, setAddPanelTab] = useState<AddPanelTab>('layouts');
  const [addPanelTabTouched, setAddPanelTabTouched] = useState(false);
  const [blockQuery, setBlockQuery] = useState('');
  const [layerQuery, setLayerQuery] = useState('');
  const [collapsedLayerIds, setCollapsedLayerIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [panelWidths, setPanelWidths] = useState<BuilderPanelWidths>(
    BUILDER_PANEL_DEFAULT_WIDTHS,
  );
  const [panelResizeActive, setPanelResizeActive] = useState<BuilderPanelSide | null>(
    null,
  );
  const [editorRevision, setEditorRevision] = useState(0);
  const [builderViewportWidth, setBuilderViewportWidth] = useState(1440);
  const [panelPreferencesReady, setPanelPreferencesReady] = useState(false);
  const [quickAddTarget, setQuickAddTarget] = useState<{
    targetNodeId: string;
    position: 'before' | 'inside' | 'after';
  } | null>(null);
  const [status, setStatus] = useState<SaveStatus>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const isDirty = status === 'unsaved' || status === 'saving' || status === 'conflict';

  const documentKind = layoutDocumentKind(layoutKind);
  const label = layoutKindLabel(layoutKind);
  const usableAssets = useMemo(
    () => assets.filter((asset) => asset.mimeType.startsWith('image/')),
    [assets],
  );
  const blocks = useMemo(
    () =>
      Object.values(PAGE_COMPONENT_REGISTRY)
        .filter(
          (definition) =>
            definition.type !== 'root' &&
            definition.type !== 'extension' &&
            definition.builder.insertable &&
            definition.builder.documentKinds.includes(documentKind),
        )
        .map((definition) => ({
          type: definition.type as BuilderInsertable,
          label: definition.label,
          description: definition.builder.description,
          preview: definition.builder.preview,
          category:
            definition.category === 'layout' ? ('layout' as const) : ('content' as const),
        })),
    [documentKind],
  );
  const presets =
    layoutKind === 'headers'
      ? GLOBAL_HEADER_PRESET_REGISTRY
      : GLOBAL_FOOTER_PRESET_REGISTRY;
  const currentVersion = resource
    ? versions.find(
        (version) =>
          version.id === (resource.draftVersionId ?? resource.publishedVersionId),
      )
    : undefined;

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

  const blockOptions = useMemo<LayoutBlockOption[]>(
    () => [
      ...presets.map((preset) => ({
        id: preset.id as BuilderInsertable,
        label: preset.label,
        description: preset.description,
        preview: preset.preview,
        category: 'preset' as const,
      })),
      ...blocks.map((block) => ({
        ...block,
        id: block.type,
      })),
      ...customExtensions
        .filter((extension) => extension.custom && extension.tenantEnabled)
        .map((extension) => ({
          id: 'extension' as BuilderInsertable,
          extensionId: extension.manifest.id,
          label: extension.manifest.name,
          description: `Add the ${extension.manifest.name} extension to this ${label.toLowerCase()}.`,
          preview: builderPreviewForComponent('extension'),
          category: 'content' as const,
        })),
    ],
    [blocks, customExtensions, label, presets],
  );
  const visibleBlockOptions = useMemo(() => {
    const query = blockQuery.trim().toLowerCase();
    return blockOptions.filter((block) => {
      const matchesQuery =
        !query ||
        block.label.toLowerCase().includes(query) ||
        block.id.toLowerCase().includes(query) ||
        block.description.toLowerCase().includes(query);
      const matchesTab =
        !addPanelTabTouched ||
        (addPanelTab === 'layouts'
          ? block.category === 'layout'
          : addPanelTab === 'elements'
            ? block.category === 'content'
            : addPanelTab === 'templates'
              ? block.category === 'preset'
              : false);
      return matchesQuery && matchesTab;
    });
  }, [addPanelTab, addPanelTabTouched, blockOptions, blockQuery]);
  const visibleLayerNodes = useMemo(() => {
    if (!canvasState) return [];
    const query = layerQuery.trim().toLowerCase();
    if (!query) return canvasState.nodes;
    const byId = new Map(canvasState.nodes.map((node) => [node.id, node]));
    const visible = new Set<string>();
    canvasState.nodes.forEach((node) => {
      if (
        node.label.toLowerCase().includes(query) ||
        node.type.toLowerCase().includes(query) ||
        node.id.toLowerCase().includes(query)
      ) {
        visible.add(node.id);
        let parent = node.parentId ? byId.get(node.parentId) : undefined;
        while (parent) {
          visible.add(parent.id);
          parent = parent.parentId ? byId.get(parent.parentId) : undefined;
        }
      }
    });
    return canvasState.nodes.filter((node) => visible.has(node.id));
  }, [canvasState, layerQuery]);
  const contextToolbarPosition = useMemo(() => {
    if (!canvasState || !selectedNodeId) return undefined;
    const node = canvasState.nodes.find((candidate) => candidate.id === selectedNodeId);
    if (!node) return undefined;
    const zoom = Math.max(canvasState.zoom / 100, 0.01);
    const x = (node.x - canvasState.viewport.x + node.width / 2) * zoom;
    const top = (node.y - canvasState.viewport.y + node.height) * zoom + 10;
    return { left: Math.max(160, x), top: Math.max(8, top), placement: 'below' as const };
  }, [canvasState, selectedNodeId]);

  async function load(resetEditor = false): Promise<boolean> {
    setStatus('loading');
    setError(null);
    try {
      const [
        resourceResponse,
        versionsResponse,
        siteResponse,
        assetsResponse,
        designResponse,
        extensionsResponse,
      ] = await Promise.all([
        api.get(`/workspaces/${workspaceId}/layouts/${layoutKind}/${layoutId}`),
        api.get(`/workspaces/${workspaceId}/layouts/${layoutKind}/${layoutId}/versions`),
        previewSiteId
          ? api.get(`/workspaces/${workspaceId}/sites/${previewSiteId}`)
          : Promise.resolve(null),
        api.get(`/workspaces/${workspaceId}/assets?limit=100`),
        previewSiteId
          ? api
              .get(`/workspaces/${workspaceId}/sites/${previewSiteId}/design-system`)
              .catch((caughtError: unknown) => {
                if (caughtError instanceof ApiClientError && caughtError.status === 404)
                  return null;
                throw caughtError;
              })
          : Promise.resolve(null),
        api.get('/extensions').catch(() => null),
      ]);
      const nextResource = LayoutExtensionResourceSchema.parse(resourceResponse);
      const nextVersions =
        LayoutExtensionVersionsResponseSchema.parse(versionsResponse).items;
      const nextDocument = documentFor(nextResource, nextVersions);
      if (!nextDocument)
        throw new Error('This layout does not have an editable document.');
      const site = siteResponse ? SiteSchema.parse(siteResponse) : undefined;
      setResource(nextResource);
      setVersions(nextVersions);
      setDocument(nextDocument);
      if (resetEditor) setEditorRevision((current) => current + 1);
      setSiteName(site?.name ?? 'All sites');
      setSiteLogo(site?.logo);
      setAssets(AssetListResponseSchema.parse(assetsResponse).items);
      setCustomExtensions(
        extensionsResponse
          ? ExtensionListResponseSchema.parse(extensionsResponse).items.filter(
              (extension) => extension.custom && extension.tenantEnabled,
            )
          : [],
      );
      setDesignSystem(
        designResponse
          ? SiteDesignSystemResponseSchema.parse(designResponse).draft
          : createDefaultSiteDesignSystem(),
      );
      setStatus('saved');
      return true;
    } catch (caughtError) {
      setStatus('error');
      setError(toErrorMessage(caughtError));
      return false;
    }
  }

  useEffect(() => {
    void load();
  }, [layoutId, layoutKind, previewSiteId, workspaceId]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  function markDirty(): void {
    setError(null);
    setNotice(null);
    setStatus('unsaved');
  }

  async function reviewDraft(): Promise<void> {
    if (
      status === 'unsaved' &&
      !window.confirm(
        'Review loads the last saved draft and discards unsaved canvas changes.',
      )
    ) {
      return;
    }
    if (await load(true)) setNotice('Review loaded the persisted draft version.');
  }

  async function saveDraft(): Promise<void> {
    const current = editorRef.current?.getDocument() ?? document;
    if (!current || 'schemaVersion' in current) return;
    setBusy(true);
    setStatus('saving');
    setError(null);
    setNotice(null);
    try {
      const nextDocument = SiteGlobalPayloadV1Schema.parse(current);
      const updated = LayoutExtensionResourceSchema.parse(
        await api.patch(`/workspaces/${workspaceId}/layouts/${layoutKind}/${layoutId}`, {
          document: nextDocument,
          ...(currentVersion
            ? { expectedVersionNumber: currentVersion.versionNumber }
            : {}),
        }),
      );
      setResource(updated);
      setDocument(nextDocument);
      editorRef.current?.acknowledgeSaved(nextDocument);
      setStatus('saved');
      setNotice(`Saved ${label.toLowerCase()} draft.`);
      const versionResponse = await api.get(
        `/workspaces/${workspaceId}/layouts/${layoutKind}/${layoutId}/versions`,
      );
      setVersions(LayoutExtensionVersionsResponseSchema.parse(versionResponse).items);
    } catch (caughtError) {
      setStatus(
        caughtError instanceof ApiClientError && caughtError.status === 409
          ? 'conflict'
          : 'error',
      );
      setError(
        caughtError instanceof ApiClientError && caughtError.status === 409
          ? `This ${label} was updated elsewhere. Reload the latest draft before saving again.`
          : toErrorMessage(caughtError),
      );
    } finally {
      setBusy(false);
    }
  }

  async function publish(): Promise<void> {
    if (!resource) return;
    if (status === 'unsaved') {
      setError('Save the draft before publishing it.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = LayoutExtensionResourceSchema.parse(
        await api.post(
          `/workspaces/${workspaceId}/layouts/${layoutKind}/${layoutId}/publish`,
          {},
        ),
      );
      setResource(updated);
      setStatus('saved');
      setNotice(`${label} published. Attached public pages now use this version.`);
      const versionResponse = await api.get(
        `/workspaces/${workspaceId}/layouts/${layoutKind}/${layoutId}/versions`,
      );
      setVersions(LayoutExtensionVersionsResponseSchema.parse(versionResponse).items);
    } catch (caughtError) {
      setStatus(
        caughtError instanceof ApiClientError && caughtError.status === 409
          ? 'conflict'
          : 'error',
      );
      setError(toErrorMessage(caughtError));
    } finally {
      setBusy(false);
    }
  }

  async function discard(): Promise<void> {
    if (!resource?.draftVersionId || !resource.publishedVersionId) return;
    if (!window.confirm(`Discard unpublished changes to “${resource.name}”?`)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = LayoutExtensionResourceSchema.parse(
        await api.post(
          `/workspaces/${workspaceId}/layouts/${layoutKind}/${layoutId}/discard`,
          {},
        ),
      );
      const versionResponse = await api.get(
        `/workspaces/${workspaceId}/layouts/${layoutKind}/${layoutId}/versions`,
      );
      const nextVersions =
        LayoutExtensionVersionsResponseSchema.parse(versionResponse).items;
      const nextDocument = documentFor(updated, nextVersions);
      if (!nextDocument) throw new Error('The published layout version is unavailable.');
      setResource(updated);
      setVersions(nextVersions);
      setDocument(nextDocument);
      setStatus('saved');
      setNotice('Unpublished draft discarded. The editor now shows the live version.');
    } catch (caughtError) {
      setStatus(
        caughtError instanceof ApiClientError && caughtError.status === 409
          ? 'conflict'
          : 'error',
      );
      setError(toErrorMessage(caughtError));
    } finally {
      setBusy(false);
    }
  }

  function updatePanelWidth(side: BuilderPanelSide, width: number): void {
    setPanelWidths((current) =>
      normalizePanelWidths({ ...current, [side]: width }, builderViewportWidth),
    );
  }

  function toggleLayer(id: string): void {
    setCollapsedLayerIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openQuickAdd(): void {
    if (!selected) return;
    setQuickAddTarget({
      targetNodeId: selected.id,
      position: selected.type === 'root' ? 'inside' : 'after',
    });
  }

  function insertQuickAdd(type: BuilderInsertable): void {
    if (!quickAddTarget) return;
    if (editorRef.current?.insertBlock(type, quickAddTarget)) {
      setQuickAddTarget(null);
    }
  }

  function openLivePreview(): void {
    const returnPageId = searchParams.get('returnPageId');
    if (!returnPageId) {
      setNotice('Open this layout from a page to preview it in context.');
      return;
    }
    window.open(
      `${rendererBaseUrl}/preview/${encodeURIComponent(returnPageId)}`,
      '_blank',
      'noopener,noreferrer',
    );
  }

  if (status === 'loading' || !resource || !document) {
    return (
      <main className="builder-loading" aria-busy="true">
        <span className="eyebrow">Layout builder</span>
        <h1>Loading {label.toLowerCase()}…</h1>
        {status === 'error' ? (
          <>
            <p className="alert alert-error" role="alert">
              {error}
            </p>
            <button
              className="button button-ghost"
              onClick={() => void load()}
              type="button"
            >
              Try again
            </button>
          </>
        ) : null}
      </main>
    );
  }

  const returnPageId = searchParams.get('returnPageId');
  const backHref =
    returnPageId && previewSiteId
      ? pagePath(workspaceId, previewSiteId, returnPageId)
      : cmsViewPath(workspaceId, 'extensions');

  function leave(): void {
    if (isDirty && !window.confirm('You have unsaved changes. Leave the builder?'))
      return;
    router.push(backHref);
  }

  return (
    <main className="builder-frame">
      <header className="builder-topbar">
        <div className="builder-title">
          <button className="button button-ghost" onClick={leave} type="button">
            {returnPageId ? '← Pages' : '← Extensions'}
          </button>
          <div>
            <span className="eyebrow">Visual builder</span>
            <h1>{resource.name}</h1>
            <code className="builder-page-path">
              {label} · {previewSiteId ? `Site ${siteName}` : siteName}
            </code>
          </div>
        </div>
        <div className="builder-actions">
          <div className="builder-topbar-viewport" aria-label="Viewport">
            {BUILDER_VIEWPORTS.map((nextViewport) => (
              <button
                className={
                  viewport === nextViewport
                    ? 'button button-small active'
                    : 'button button-small'
                }
                key={nextViewport}
                onClick={() => {
                  setViewport(nextViewport);
                  editorRef.current?.setViewport(nextViewport);
                }}
                type="button"
              >
                {nextViewport.charAt(0).toUpperCase() + nextViewport.slice(1)}
              </button>
            ))}
          </div>
          <span className={`builder-save-status status-${status}`} role="status">
            {status === 'saving'
              ? 'Saving…'
              : status === 'error'
                ? 'Validation error'
                : status === 'conflict'
                  ? 'Conflict · Reload required'
                  : status === 'unsaved'
                    ? resource.publishedVersionId
                      ? 'Live · Unsaved changes'
                      : 'Draft · Unsaved changes'
                    : resource.draftVersionId
                      ? resource.publishedVersionId
                        ? 'Live · Draft saved'
                        : 'Draft · Not published'
                      : 'Live · Up to date'}
          </span>
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
            className="button button-ghost"
            disabled={busy}
            onClick={() => void reviewDraft()}
            type="button"
          >
            Review draft
          </button>
          <button
            className="button button-primary"
            disabled={busy}
            onClick={() => void saveDraft()}
            type="button"
          >
            Save draft
          </button>
          {resource.draftVersionId && resource.publishedVersionId ? (
            <button
              className="button button-ghost"
              disabled={busy}
              onClick={() => void discard()}
              type="button"
            >
              Discard draft
            </button>
          ) : null}
          <button
            className="button button-success"
            disabled={busy || !resource.draftVersionId || status === 'unsaved'}
            onClick={() => void publish()}
            type="button"
          >
            Publish {label}
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
          <div aria-hidden="true" className="builder-resize-shield" />
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
                ['settings', '⚙', 'Layout settings'],
              ] as const
            ).map(([tool, icon, toolLabel]) => (
              <button
                aria-label={toolLabel}
                aria-pressed={activeTool === tool}
                className={`builder-tool-button${activeTool === tool ? ' is-active' : ''}`}
                key={tool}
                onClick={() => setActiveTool(tool)}
                type="button"
              >
                <span aria-hidden="true">{icon}</span>
                <span>{toolLabel.replace(' blocks', '')}</span>
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
          {!leftPanelCollapsed ? (
            <aside className="builder-panel builder-blocks-panel" data-panel="left">
              {activeTool === 'add' ? (
                <>
                  <div className="builder-panel-heading">
                    <span className="eyebrow">Components</span>
                    <strong>Add to {label.toLowerCase()}</strong>
                  </div>
                  <div
                    aria-label="Add component type"
                    className="builder-add-tabs"
                    role="tablist"
                  >
                    {(['layouts', 'elements', 'saved', 'templates'] as const).map(
                      (tab) => (
                        <button
                          aria-selected={addPanelTab === tab}
                          className={addPanelTab === tab ? 'is-active' : undefined}
                          key={tab}
                          onClick={() => {
                            setAddPanelTab(tab);
                            setAddPanelTabTouched(true);
                          }}
                          role="tab"
                          type="button"
                        >
                          {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                      ),
                    )}
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
                  {addPanelTab === 'saved' ? (
                    <div className="empty-state" data-catalog-tab="saved">
                      <strong>No saved blocks yet.</strong>
                      <span className="muted small">
                        Save reusable header or footer patterns from the canvas when this
                        resource is ready to share.
                      </span>
                    </div>
                  ) : (
                    <div className="builder-block-list" data-catalog-tab={addPanelTab}>
                      {visibleBlockOptions.map((block) => (
                        <BuilderBlockCard
                          addLabel={`${block.label} add`}
                          category={block.category}
                          dataBlockType={block.extensionId ?? block.id}
                          description={block.description}
                          dragLabel={`Drag ${block.label} block`}
                          key={`${block.id}:${block.extensionId ?? ''}`}
                          label={block.label}
                          onAdd={() =>
                            block.extensionId
                              ? editorRef.current?.addExtensionBlock(block.extensionId)
                              : editorRef.current?.addBlock(block.id)
                          }
                          onDragStart={undefined}
                          preview={block.preview}
                        />
                      ))}
                    </div>
                  )}
                  {addPanelTab !== 'saved' && visibleBlockOptions.length === 0 ? (
                    <p className="muted small builder-empty-message">
                      No matching components.
                    </p>
                  ) : null}
                  <p className="muted small builder-help">
                    Blocks are versioned with this {label.toLowerCase()} and stay in
                    canvas order.
                  </p>
                </>
              ) : activeTool === 'layers' ? (
                <div className="builder-layers-section">
                  <div className="builder-panel-heading">
                    <span className="eyebrow">Layers</span>
                    <strong>{label} structure</strong>
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
                    aria-label="Page layers"
                    className="builder-layer-tree"
                    role="tree"
                  >
                    {canvasState ? (
                      renderLayoutLayers(
                        visibleLayerNodes,
                        undefined,
                        selectedNodeId,
                        collapsedLayerIds,
                        (id) => editorRef.current?.selectNode(id),
                        toggleLayer,
                      )
                    ) : (
                      <span className="muted small">Preparing layers…</span>
                    )}
                  </div>
                </div>
              ) : activeTool === 'assets' ? (
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
                    <p className="muted small">No image assets are available.</p>
                  )}
                </div>
              ) : (
                <div className="builder-layers-section builder-page-capabilities">
                  <div className="builder-panel-heading">
                    <span className="eyebrow">Layout settings</span>
                    <strong>{resource.name}</strong>
                  </div>
                  <p className="muted small">
                    This {label.toLowerCase()} is reusable across pages. Publish it here,
                    then drag it into a page from the Extensions &amp; advanced group.
                    Each page receives an independent copy.
                  </p>
                </div>
              )}
            </aside>
          ) : null}
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
              options={visibleBlockOptions
                .filter((block) => !block.extensionId)
                .map((block) => ({
                  type: block.id,
                  label: block.label,
                }))}
              targetLabel={selected?.type}
            />
            <GrapesEditor
              designSystem={designSystem}
              documentKind={documentKind}
              initialPayload={document}
              navigation={{}}
              onCanvasStateChange={setCanvasState}
              onDirty={markDirty}
              onDocumentChange={(nextDocument) => {
                if (!('schemaVersion' in nextDocument)) setDocument(nextDocument);
              }}
              onError={(message) => {
                setStatus('error');
                setError(`Editor error: ${message}`);
              }}
              onHistoryChange={setHistory}
              onInteractionModeChange={setInteractionMode}
              onReady={() =>
                setStatus((current) => (current === 'loading' ? 'saved' : current))
              }
              onSelectionChange={(nextSelection) => {
                setSelectedNodeId(nextSelection?.id ?? null);
                setSelected(nextSelection);
              }}
              key={editorRevision}
              ref={editorRef}
              {...(siteLogo ? { siteLogo } : {})}
              siteName={siteName}
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
        {!rightPanelCollapsed ? (
          <aside className="builder-panel builder-properties-panel" data-panel="right">
            <div className="builder-properties-heading-row">
              <div className="builder-panel-heading">
                <span className="eyebrow">Properties</span>
                <strong>{selected ? selected.type : 'Nothing selected'}</strong>
              </div>
              <button
                aria-label="Hide inspector"
                className="button button-small button-ghost"
                onClick={() => setRightPanelCollapsed(true)}
                type="button"
              >
                Hide
              </button>
            </div>
            {selected ? (
              <BuilderInspector
                designSystem={designSystem}
                inspectorTab={inspectorTab}
                onAddStructuralChild={(slotName, childType) =>
                  childType && childType !== 'root' && childType !== 'reusable-instance'
                    ? editorRef.current?.addStructuralChild(slotName, childType)
                    : undefined
                }
                onDuplicateStructuralChild={(nodeId) =>
                  editorRef.current?.duplicateStructuralChild(nodeId)
                }
                onInspectorTabChange={setInspectorTab}
                onMoveStructuralChild={(nodeId, direction) =>
                  editorRef.current?.moveStructuralChild(nodeId, direction)
                }
                onRemoveStructuralChild={(nodeId) =>
                  editorRef.current?.removeStructuralChild(nodeId)
                }
                onReorderStructuralChild={(sourceId, targetId, position) =>
                  editorRef.current?.moveNode({
                    nodeId: sourceId,
                    targetNodeId: targetId,
                    position,
                  })
                }
                onSelectNode={(nodeId) => editorRef.current?.selectNode(nodeId)}
                onToggleSection={(section, open) =>
                  setOpenSections((current) => ({ ...current, [section]: open }))
                }
                openSections={openSections}
                resetSelectedPartStyle={(partName, property) =>
                  editorRef.current?.resetSelectedPartStyle(partName, property)
                }
                resetSelectedStyle={(property) =>
                  editorRef.current?.resetSelectedStyle(property)
                }
                selected={selected}
                updateSelectedPartStyle={(partName, property, value) =>
                  editorRef.current?.updateSelectedPartStyle(partName, property, value)
                }
                updateSelectedProperty={(property, value) =>
                  editorRef.current?.updateSelectedProperty(property, value)
                }
                updateSelectedStyle={(property, value: string | StyleTokenReference) =>
                  editorRef.current?.updateSelectedStyle(property, value)
                }
                usableAssets={usableAssets}
                validationScope={layoutKind === 'headers' ? 'header' : 'footer'}
                viewport={viewport}
              />
            ) : (
              <p className="muted small">
                Select a layout component on the canvas to edit it.
              </p>
            )}
          </aside>
        ) : (
          <button
            aria-label="Show inspector"
            className="builder-inspector-expand button button-small button-ghost"
            onClick={() => setRightPanelCollapsed(false)}
            type="button"
          >
            Show inspector
          </button>
        )}
      </div>
      <section className="panel page-secondary-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Immutable history</span>
            <h2>Versions</h2>
          </div>
        </div>
        <div className="list">
          {versions.map((version) => (
            <div className="list-row" key={version.id}>
              <span>Version {version.versionNumber}</span>
              <span className="muted">
                {version.status} · {new Date(version.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
