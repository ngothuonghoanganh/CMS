'use client';

import {
  AssetListResponseSchema,
  ExtensionListResponseSchema,
  LayoutExtensionListResponseSchema,
  PagePayloadSchema,
  PAGE_COMPONENT_REGISTRY,
  SiteDesignSystemResponseSchema,
  SiteSchema,
  TemplateSchema,
  TemplateVersionsResponseSchema,
  createDefaultSiteDesignSystem,
  builderPreviewForComponent,
  type Asset,
  type BuilderDocumentKind,
  type ExtensionDescriptor,
  type PagePayload,
  type SiteDesignSystem,
  type Site,
  type Template,
  type TemplateVersion,
  type LayoutExtensionResource,
  type PageLayoutAttachment,
  type PageLayoutSlot,
} from '@payload/contracts';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { ApiClientError, api } from '../app/lib/api';
import { type BuilderInsertable } from './block-presets';
import { BUILT_IN_TEMPLATE_REGISTRY } from './template-registry';
import { BuilderBlockCard } from './builder-block-catalog';
import { BuilderContextToolbar } from './canvas/builder-context-toolbar';
import {
  BuilderInspector,
  type InspectorSectionKey,
  type InspectorTab,
} from './inspector/builder-inspector';
import { BuilderPanelResizer } from './builder-panel-resizer';
import {
  BUILDER_PANEL_DEFAULT_WIDTHS,
  normalizePanelWidths,
  persistPanelWidths,
  readPanelWidths,
  type BuilderPanelSide,
  type BuilderPanelWidths,
} from './builder-panel-size';
import {
  BUILDER_VIEWPORTS,
  GrapesEditor,
  type GrapesEditorHandle,
  type InteractionMode,
  type SelectedBuilderNode,
} from './grapes-editor';
import { PageMinimap, type BuilderCanvasState } from './builder-minimap';
import type { BuilderViewport } from './builder-adapter';

type TemplateBuilderShellProps = {
  workspaceId: string;
  siteId: string;
  templateId: string;
};

type SaveStatus = 'loading' | 'saved' | 'unsaved' | 'saving' | 'error' | 'conflict';
type BuilderTool = 'add' | 'layers' | 'settings';
type AddPanelTab = 'layouts' | 'elements' | 'saved' | 'templates';

type BlockOption = {
  type: BuilderInsertable;
  extensionId?: string;
  label: string;
  description: string;
  category: 'layout' | 'content';
  preview: Parameters<typeof BuilderBlockCard>[0]['preview'];
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

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  return error instanceof Error ? error.message : 'The template builder could not load.';
}

function newAttachmentId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function renderLayerList(
  state: BuilderCanvasState | null,
  selectedId: string | null,
  onSelect: (id: string) => void,
) {
  if (!state) return <span className="muted small">Preparing layers…</span>;
  return state.nodes.map((node) => (
    <button
      aria-selected={selectedId === node.id}
      className={`builder-layer-button${selectedId === node.id ? ' selected' : ''}`}
      data-builder-layer-id={node.id}
      key={node.id}
      onClick={() => onSelect(node.id)}
      role="treeitem"
      style={{ paddingLeft: `${10 + node.depth * 14}px` }}
      type="button"
    >
      <span aria-hidden="true" className="builder-layer-icon">
        ▪
      </span>
      <span className="builder-layer-label">{node.label}</span>
    </button>
  ));
}

export default function TemplateBuilderShell({
  workspaceId,
  siteId,
  templateId,
}: TemplateBuilderShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editorRef = useRef<GrapesEditorHandle>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [payload, setPayload] = useState<PagePayload | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [customExtensions, setCustomExtensions] = useState<ExtensionDescriptor[]>([]);
  const [designSystem, setDesignSystem] = useState<SiteDesignSystem>(
    createDefaultSiteDesignSystem(),
  );
  const [headers, setHeaders] = useState<LayoutExtensionResource[]>([]);
  const [footers, setFooters] = useState<LayoutExtensionResource[]>([]);
  const [layoutAttachments, setLayoutAttachments] = useState<PageLayoutAttachment[]>([]);
  const [selected, setSelected] = useState<SelectedBuilderNode | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [canvasState, setCanvasState] = useState<BuilderCanvasState | null>(null);
  const [viewport, setViewport] = useState<BuilderViewport>('desktop');
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('select');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('content');
  const [openSections, setOpenSections] = useState(inspectorSections);
  const [activeTool, setActiveTool] = useState<BuilderTool>('add');
  const [addPanelTab, setAddPanelTab] = useState<AddPanelTab>('layouts');
  const [blockQuery, setBlockQuery] = useState('');
  const [panelWidths, setPanelWidths] = useState<BuilderPanelWidths>(
    BUILDER_PANEL_DEFAULT_WIDTHS,
  );
  const [builderViewportWidth, setBuilderViewportWidth] = useState(1440);
  const [panelResizeActive, setPanelResizeActive] = useState<BuilderPanelSide | null>(
    null,
  );
  const [editorRevision, setEditorRevision] = useState(0);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [panelPreferencesReady, setPanelPreferencesReady] = useState(false);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [status, setStatus] = useState<SaveStatus>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const blocks = useMemo<BlockOption[]>(
    () =>
      Object.values(PAGE_COMPONENT_REGISTRY)
        .filter(
          (definition) =>
            definition.type !== 'root' &&
            definition.type !== 'extension' &&
            definition.builder.insertable &&
            definition.builder.documentKinds.includes('page' as BuilderDocumentKind),
        )
        .map((definition) => ({
          type: definition.type as BuilderInsertable,
          label: definition.label,
          description: definition.builder.description,
          category:
            definition.category === 'layout' ? ('layout' as const) : ('content' as const),
          preview: definition.builder.preview,
        }))
        .concat(
          customExtensions
            .filter((extension) => extension.custom && extension.tenantEnabled)
            .map((extension) => ({
              type: 'extension' as BuilderInsertable,
              extensionId: extension.manifest.id,
              label: extension.manifest.name,
              description: `Add the ${extension.manifest.name} extension to this template.`,
              category: 'content' as const,
              preview: builderPreviewForComponent('extension'),
            })),
        ),
    [customExtensions],
  );

  const visibleBlocks = useMemo(() => {
    const query = blockQuery.trim().toLowerCase();
    return blocks.filter((block) => {
      const matchesQuery =
        !query ||
        block.label.toLowerCase().includes(query) ||
        block.type.toLowerCase().includes(query) ||
        block.description.toLowerCase().includes(query);
      const matchesTab =
        addPanelTab === 'layouts'
          ? block.category === 'layout'
          : addPanelTab === 'elements'
            ? block.category === 'content'
            : false;
      return matchesQuery && matchesTab;
    });
  }, [addPanelTab, blockQuery, blocks]);

  const latestVersion = versions.find(
    (version) => version.id === template?.latestVersionId,
  );
  const isDirty = status === 'unsaved' || status === 'saving' || status === 'conflict';

  useEffect(() => {
    const restore = () => {
      setBuilderViewportWidth(window.innerWidth);
      setPanelWidths(readPanelWidths(window.localStorage, window.innerWidth));
      setPanelPreferencesReady(true);
    };
    restore();
    const onResize = () => {
      setBuilderViewportWidth(window.innerWidth);
      setPanelWidths((current) => normalizePanelWidths(current, window.innerWidth));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (panelPreferencesReady) persistPanelWidths(window.localStorage, panelWidths);
  }, [panelPreferencesReady, panelWidths]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  async function load(resetEditor = false): Promise<boolean> {
    setStatus('loading');
    setError(null);
    try {
      const [
        templateResponse,
        versionsResponse,
        siteResponse,
        assetsResponse,
        designResponse,
        headersResponse,
        footersResponse,
        extensionsResponse,
      ] = await Promise.all([
        api.get(`/workspaces/${workspaceId}/templates/${templateId}`),
        api.get(`/workspaces/${workspaceId}/templates/${templateId}/versions`),
        api.get(`/workspaces/${workspaceId}/sites/${siteId}`),
        api.get(`/workspaces/${workspaceId}/assets?limit=100`),
        api
          .get(`/workspaces/${workspaceId}/sites/${siteId}/design-system`)
          .catch(() => null),
        api.get(`/sites/${siteId}/layouts/headers`),
        api.get(`/sites/${siteId}/layouts/footers`),
        api.get('/extensions').catch(() => null),
      ]);
      const nextTemplate = TemplateSchema.parse(templateResponse);
      const nextVersions = TemplateVersionsResponseSchema.parse(versionsResponse).items;
      const nextSite = SiteSchema.parse(siteResponse);
      if (nextTemplate.siteId && nextTemplate.siteId !== siteId) {
        throw new Error('This template belongs to another site.');
      }
      const requestedVersion = Number(searchParams.get('version'));
      const selectedVersion = Number.isInteger(requestedVersion)
        ? nextVersions.find((version) => version.versionNumber === requestedVersion)
        : undefined;
      const nextPayload = PagePayloadSchema.parse(
        selectedVersion?.payload ?? nextTemplate.payload,
      );
      setTemplate(nextTemplate);
      setVersions(nextVersions);
      setPayload(nextPayload);
      setSite(nextSite);
      setAssets(AssetListResponseSchema.parse(assetsResponse).items);
      setDesignSystem(
        designResponse
          ? SiteDesignSystemResponseSchema.parse(designResponse).draft
          : createDefaultSiteDesignSystem(),
      );
      setHeaders(LayoutExtensionListResponseSchema.parse(headersResponse).items);
      setFooters(LayoutExtensionListResponseSchema.parse(footersResponse).items);
      setCustomExtensions(
        extensionsResponse
          ? ExtensionListResponseSchema.parse(extensionsResponse).items.filter(
              (extension) => extension.custom && extension.tenantEnabled,
            )
          : [],
      );
      setLayoutAttachments(
        selectedVersion?.layoutAttachments ?? nextTemplate.layoutAttachments ?? [],
      );
      if (resetEditor) setEditorRevision((current) => current + 1);
      setNotice(
        selectedVersion
          ? `Reviewing persisted template version ${selectedVersion.versionNumber}.`
          : resetEditor
            ? 'Review loaded the persisted draft version.'
            : null,
      );
      setStatus('saved');
      return true;
    } catch (caughtError) {
      setStatus('error');
      setError(errorMessage(caughtError));
      return false;
    }
  }

  useEffect(() => {
    void load();
  }, [siteId, templateId, workspaceId]);

  function markDirty() {
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
    await load(true);
  }

  function setLayout(type: 'header' | 'footer', resourceId: string) {
    setLayoutAttachments((current) => {
      const existing = current.find((attachment) => attachment.type === type);
      if (!resourceId) return current.filter((attachment) => attachment.type !== type);
      const next: PageLayoutAttachment = {
        id: existing?.id ?? newAttachmentId(),
        type,
        resourceId,
        slot:
          existing?.slot ??
          (type === 'header' ? 'page.header.top' : 'page.footer.bottom'),
        enabled: true,
      };
      return [...current.filter((attachment) => attachment.type !== type), next];
    });
    markDirty();
  }

  function setHeaderSlot(slot: PageLayoutSlot) {
    setLayoutAttachments((current) =>
      current.map((attachment) =>
        attachment.type === 'header' ? { ...attachment, slot } : attachment,
      ),
    );
    markDirty();
  }

  async function refreshVersions() {
    const response = await api.get(
      `/workspaces/${workspaceId}/templates/${templateId}/versions`,
    );
    setVersions(TemplateVersionsResponseSchema.parse(response).items);
  }

  async function saveDraft() {
    if (!template || !editorRef.current || busy) return;
    const current = editorRef.current.getDocument();
    setBusy(true);
    setStatus('saving');
    setError(null);
    setNotice(null);
    try {
      const nextPayload = PagePayloadSchema.parse(
        'payload' in current ? current.payload : current,
      );
      const updated = TemplateSchema.parse(
        await api.patch(`/workspaces/${workspaceId}/templates/${templateId}`, {
          payload: nextPayload,
          layoutAttachments,
          ...(latestVersion
            ? { expectedVersionNumber: latestVersion.versionNumber }
            : {}),
        }),
      );
      setTemplate(updated);
      setPayload(nextPayload);
      editorRef.current.acknowledgeSaved(nextPayload);
      await refreshVersions();
      setStatus('saved');
      setNotice('Saved template draft.');
    } catch (caughtError) {
      if (caughtError instanceof ApiClientError && caughtError.status === 409) {
        setStatus('conflict');
        setError(
          'This Template was updated elsewhere. Reload the latest version before saving again.',
        );
      } else {
        setStatus('error');
        setError(errorMessage(caughtError));
      }
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!template || busy) return;
    if (status === 'unsaved') {
      setError('Save the current draft before publishing it.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = TemplateSchema.parse(
        await api.post(`/workspaces/${workspaceId}/templates/${templateId}/publish`, {}),
      );
      setTemplate(updated);
      setStatus('saved');
      setNotice('Template published. New pages can use this version.');
    } catch (caughtError) {
      setStatus(
        caughtError instanceof ApiClientError && caughtError.status === 409
          ? 'conflict'
          : 'error',
      );
      setError(errorMessage(caughtError));
    } finally {
      setBusy(false);
    }
  }

  function leave() {
    if (isDirty && !window.confirm('You have unsaved changes. Leave the builder?'))
      return;
    const fallback = `/?view=templates&siteId=${encodeURIComponent(siteId)}`;
    router.push(searchParams.get('return') || fallback);
  }

  function updatePanelWidth(side: BuilderPanelSide, width: number) {
    setPanelWidths((current) =>
      normalizePanelWidths({ ...current, [side]: width }, builderViewportWidth),
    );
  }

  if (status === 'loading' || !template || !payload || !site) {
    return (
      <main className="builder-loading" aria-busy="true">
        <span className="eyebrow">Template builder</span>
        <h1>Loading template…</h1>
        {status === 'error' ? (
          <p className="alert alert-error" role="alert">
            {error}
          </p>
        ) : null}
      </main>
    );
  }

  const selectedHeader = layoutAttachments.find(
    (attachment) => attachment.type === 'header',
  );
  const selectedFooter = layoutAttachments.find(
    (attachment) => attachment.type === 'footer',
  );
  return (
    <main className="builder-frame">
      <header className="builder-topbar">
        <div className="builder-title">
          <button className="button button-ghost" onClick={leave} type="button">
            ← Templates
          </button>
          <div>
            <span className="eyebrow">Visual template builder</span>
            <h1>{template.name}</h1>
            <code className="builder-page-path">Template · Site {site.name}</code>
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
                    ? 'Draft · Unsaved changes'
                    : template.publishedVersionId === template.latestVersionId
                      ? 'Published · Up to date'
                      : template.publishedVersionId
                        ? 'Published · Draft saved'
                        : 'Draft · Not published'}
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
          <button
            className="button button-success"
            disabled={busy || status === 'unsaved'}
            onClick={() => void publish()}
            type="button"
          >
            Publish Template
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
                ['settings', '⚙', 'Template settings'],
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
          {!leftPanelCollapsed ? (
            <aside className="builder-panel builder-blocks-panel" data-panel="left">
              {activeTool === 'add' ? (
                <>
                  <div className="builder-panel-heading">
                    <span className="eyebrow">Components</span>
                    <strong>Add to template</strong>
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
                          onClick={() => setAddPanelTab(tab)}
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
                        Reusable sections can be added from a page builder.
                      </span>
                    </div>
                  ) : addPanelTab === 'templates' ? (
                    <div className="builder-block-list" data-catalog-tab="templates">
                      {BUILT_IN_TEMPLATE_REGISTRY.map((item) => (
                        <BuilderBlockCard
                          addLabel={`${item.name} template add`}
                          category="template"
                          dataBlockType={item.id}
                          description={item.description}
                          dragLabel={`Add ${item.name} template`}
                          key={item.id}
                          label={item.name}
                          onAdd={() => editorRef.current?.addBlock(item.sourcePreset)}
                          onDragStart={undefined}
                          preview={item.preview}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="builder-block-list" data-catalog-tab={addPanelTab}>
                      {visibleBlocks.map((block) => (
                        <BuilderBlockCard
                          addLabel={`${block.label} add`}
                          category={block.category}
                          dataBlockType={block.extensionId ?? block.type}
                          description={block.description}
                          dragLabel={`Add ${block.label} block`}
                          key={`${block.type}:${block.extensionId ?? ''}`}
                          label={block.label}
                          onAdd={() =>
                            block.extensionId
                              ? editorRef.current?.addExtensionBlock(block.extensionId)
                              : editorRef.current?.addBlock(block.type)
                          }
                          onDragStart={undefined}
                          preview={block.preview}
                        />
                      ))}
                    </div>
                  )}
                  {addPanelTab !== 'saved' &&
                  addPanelTab !== 'templates' &&
                  visibleBlocks.length === 0 ? (
                    <p className="muted small builder-empty-message">
                      No matching components.
                    </p>
                  ) : null}
                </>
              ) : activeTool === 'layers' ? (
                <div className="builder-layers-section">
                  <div className="builder-panel-heading">
                    <span className="eyebrow">Layers</span>
                    <strong>Template structure</strong>
                  </div>
                  <div
                    aria-label="Template layers"
                    className="builder-layer-tree"
                    role="tree"
                  >
                    {renderLayerList(canvasState, selectedNodeId, (id) =>
                      editorRef.current?.selectNode(id),
                    )}
                  </div>
                </div>
              ) : (
                <div className="builder-layers-section builder-page-capabilities">
                  <div className="builder-panel-heading">
                    <span className="eyebrow">Template settings</span>
                    <strong>Layout attachments</strong>
                  </div>
                  <p className="muted small">
                    A template keeps Header/Footer as live resource references. Applying
                    it copies the attachment configuration into the new page.
                  </p>
                  <div className="stack">
                    <label>
                      Header
                      <select
                        aria-label="Template header"
                        onChange={(event) => setLayout('header', event.target.value)}
                        value={selectedHeader?.resourceId ?? ''}
                      >
                        <option value="">No header</option>
                        {headers.map((resource) => (
                          <option key={resource.id} value={resource.id}>
                            {resource.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {selectedHeader ? (
                      <label>
                        Header placement
                        <select
                          aria-label="Template header placement"
                          onChange={(event) =>
                            setHeaderSlot(event.target.value as PageLayoutSlot)
                          }
                          value={selectedHeader.slot}
                        >
                          <option value="page.header.top">Top</option>
                          <option value="page.header.top-left">Top left</option>
                          <option value="page.header.top-right">Top right</option>
                        </select>
                      </label>
                    ) : null}
                    <label>
                      Footer
                      <select
                        aria-label="Template footer"
                        onChange={(event) => setLayout('footer', event.target.value)}
                        value={selectedFooter?.resourceId ?? ''}
                      >
                        <option value="">No footer</option>
                        {footers.map((resource) => (
                          <option key={resource.id} value={resource.id}>
                            {resource.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
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
        <section aria-label="Builder canvas" className="builder-canvas-panel">
          <div className="builder-viewport-toolbar">
            <div
              aria-label="Canvas interaction mode"
              className="builder-interaction-toolbar"
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
            </div>
          </div>
          <div className="builder-editor-shell">
            <BuilderContextToolbar
              onDelete={() => editorRef.current?.deleteSelected()}
              onDuplicate={() => editorRef.current?.duplicateSelected()}
              onMoveDown={() => editorRef.current?.moveSelected('down')}
              onMoveUp={() => editorRef.current?.moveSelected('up')}
              onQuickAdd={() => undefined}
              onSelectParent={() => editorRef.current?.selectParent()}
              position={undefined}
              selected={selected}
            />
            <GrapesEditor
              designSystem={designSystem}
              documentKind="page"
              initialPayload={payload}
              navigation={{}}
              onCanvasStateChange={setCanvasState}
              onDirty={markDirty}
              onDocumentChange={(nextDocument) => {
                if ('payload' in nextDocument) setPayload(nextDocument.payload);
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
              {...(site.logo ? { siteLogo: site.logo } : {})}
              siteName={site.name}
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
                <strong>{selected?.type ?? 'Nothing selected'}</strong>
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
                updateSelectedStyle={(property, value) =>
                  editorRef.current?.updateSelectedStyle(property, value)
                }
                usableAssets={assets}
                validationScope="page"
                viewport={viewport}
              />
            ) : (
              <p className="muted small">
                Select an element on the canvas or in Layers to edit it.
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
            <h2>Template versions</h2>
          </div>
          <span className="muted small">
            Latest v{latestVersion?.versionNumber ?? '—'}
          </span>
        </div>
        <div className="list">
          {versions.map((version) => (
            <div className="list-row" key={version.id}>
              <strong>Version {version.versionNumber}</strong>
              <span className="muted">
                {version.id === template.publishedVersionId
                  ? 'Published'
                  : version.id === template.latestVersionId
                    ? 'Draft'
                    : 'Snapshot'}{' '}
                · {new Date(version.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
