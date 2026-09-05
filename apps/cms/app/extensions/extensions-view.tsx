'use client';

import {
  CreateCustomExtensionRequestSchema,
  CreateExtensionConnectionRequestSchema,
  ExtensionConfigRequestSchema,
  ExtensionConnectionSchema,
  ExtensionConnectionListResponseSchema,
  ExtensionListResponseSchema,
  LayoutExtensionListResponseSchema,
  LayoutExtensionResourceSchema,
  type LayoutExtensionKind,
  type LayoutExtensionResource,
  UpdateCustomExtensionRequestSchema,
  UpdateExtensionConnectionRequestSchema,
  type ExtensionConfiguration,
  type ExtensionConnection,
  type ExtensionDescriptor,
} from '@payload/contracts';
import { useEffect, useMemo, useState } from 'react';

import { api, ApiClientError } from '../lib/api';
import { StatusBadge } from '../status-badge';
import { Icon } from '../ui/icons';
import { Drawer } from '../ui/surfaces';

type CustomExtensionDraft = {
  id: string;
  name: string;
  version: string;
  description: string;
  eyebrow: string;
  heading: string;
  body: string;
  buttonLabel: string;
  buttonHref: string;
  accentColor: string;
};

type ConnectionDraft = {
  id?: string;
  name: string;
  configuration: string;
  secret: string;
};

type LayoutCreateDraft = {
  name: string;
  description: string;
};

const emptyCustomExtensionDraft: CustomExtensionDraft = {
  id: 'custom-',
  name: '',
  version: '1.0.0',
  description: '',
  eyebrow: '',
  heading: '',
  body: '',
  buttonLabel: '',
  buttonHref: '',
  accentColor: '#8cf0c5',
};

const emptyConnectionDraft: ConnectionDraft = {
  name: '',
  configuration: '{}',
  secret: '',
};

const emptyLayoutCreateDraft: LayoutCreateDraft = {
  name: '',
  description: '',
};

type ExtensionsViewProps = {
  canManage: boolean;
  canManageLayouts?: boolean;
  canDeleteLayouts?: boolean;
  workspaceId?: string;
  siteId?: string;
};

function layoutSegment(kind: LayoutExtensionKind): 'headers' | 'footers' {
  return kind === 'header' ? 'headers' : 'footers';
}

export function ExtensionsView({
  canManage,
  canManageLayouts = false,
  canDeleteLayouts = false,
  workspaceId,
  siteId,
}: ExtensionsViewProps) {
  const [extensions, setExtensions] = useState<ExtensionDescriptor[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [configuration, setConfiguration] = useState<ExtensionConfiguration>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [customEditorMode, setCustomEditorMode] = useState<'create' | 'edit' | null>(
    null,
  );
  const [customDraft, setCustomDraft] = useState<CustomExtensionDraft>(
    emptyCustomExtensionDraft,
  );
  const [connections, setConnections] = useState<Record<string, ExtensionConnection[]>>(
    {},
  );
  const [connectionsFor, setConnectionsFor] = useState<string | null>(null);
  const [connectionDraft, setConnectionDraft] =
    useState<ConnectionDraft>(emptyConnectionDraft);
  const [layoutExtensions, setLayoutExtensions] = useState<LayoutExtensionResource[]>([]);
  const [layoutBusy, setLayoutBusy] = useState<LayoutExtensionKind | null>(null);
  const [layoutDeletingId, setLayoutDeletingId] = useState<string | null>(null);
  const [layoutCreateDraft, setLayoutCreateDraft] =
    useState<LayoutCreateDraft>(emptyLayoutCreateDraft);
  const [layoutCreateOpen, setLayoutCreateOpen] = useState(false);
  const [editingLayoutKind, setEditingLayoutKind] = useState<LayoutExtensionKind | null>(
    null,
  );

  const enabledCount = extensions.filter((extension) => extension.tenantEnabled).length;
  const runtimeCount = extensions.reduce(
    (total, extension) =>
      total + (extension.manifest.contributions?.renderer?.runtimeIds.length ?? 0),
    0,
  );
  const filteredExtensions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return extensions.filter((extension) => {
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'enabled' ? extension.tenantEnabled : !extension.tenantEnabled);
      const matchesSearch =
        normalizedSearch.length === 0 ||
        [
          extension.manifest.name,
          extension.manifest.id,
          extension.manifest.description ?? '',
          ...extension.capabilities,
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch);
      return matchesStatus && matchesSearch;
    });
  }, [extensions, search, statusFilter]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void api
      .get('/extensions')
      .then((response) => {
        if (active) setExtensions(ExtensionListResponseSchema.parse(response).items);
      })
      .catch((caughtError: unknown) => {
        if (!active) return;
        setError(
          caughtError instanceof ApiClientError || caughtError instanceof Error
            ? caughtError.message
            : 'Extensions are unavailable',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    let active = true;
    if (!workspaceId) {
      setLayoutExtensions([]);
      return () => {
        active = false;
      };
    }
    setLayoutExtensions([]);
    void Promise.all(
      (['header', 'footer'] as const).map(async (kind) => {
        try {
          const response = await api.get(
            `/workspaces/${workspaceId}/layouts/${layoutSegment(kind)}`,
          );
          return LayoutExtensionListResponseSchema.parse(response).items;
        } catch {
          return [];
        }
      }),
    ).then((groups) => {
      if (active) setLayoutExtensions(groups.flat());
    });
    return () => {
      active = false;
    };
  }, [reloadKey, workspaceId]);

  function startCreateLayout(kind: LayoutExtensionKind): void {
    if (!workspaceId || !canManageLayouts) return;
    setError(null);
    setLayoutCreateDraft(emptyLayoutCreateDraft);
    setEditingLayoutKind(kind);
    setLayoutCreateOpen(true);
  }

  async function createLayoutExtension(kind: LayoutExtensionKind): Promise<void> {
    if (!workspaceId || !canManageLayouts || !layoutCreateDraft.name.trim()) return;
    setLayoutBusy(kind);
    setError(null);
    try {
      const resource = LayoutExtensionResourceSchema.parse(
        await api.post(`/workspaces/${workspaceId}/layouts/${layoutSegment(kind)}`, {
          kind,
          name: layoutCreateDraft.name.trim(),
          ...(layoutCreateDraft.description.trim()
            ? { description: layoutCreateDraft.description.trim() }
            : {}),
        }),
      );
      setLayoutExtensions((current) => [...current, resource]);
      setLayoutCreateDraft(emptyLayoutCreateDraft);
      setLayoutCreateOpen(false);
      setEditingLayoutKind(resource.kind);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Layout creation failed',
      );
    } finally {
      setLayoutBusy(null);
    }
  }

  function openLayoutMenu(kind: LayoutExtensionKind): void {
    if (!workspaceId) return;
    setLayoutCreateOpen(false);
    setEditingLayoutKind(kind);
  }

  function openLayoutBuilder(resource: LayoutExtensionResource): void {
    if (!workspaceId) return;
    const previewSite = siteId ? `?siteId=${encodeURIComponent(siteId)}` : '';
    window.location.assign(
      `/workspaces/${workspaceId}/layouts/${layoutSegment(resource.kind)}/${resource.id}/builder${previewSite}`,
    );
  }

  async function removeLayoutExtension(resource: LayoutExtensionResource): Promise<void> {
    if (!workspaceId || !canDeleteLayouts) return;
    if (
      !window.confirm(
        `Delete ${resource.name}? Existing page blocks must be removed first.`,
      )
    ) {
      return;
    }
    setLayoutDeletingId(resource.id);
    setError(null);
    try {
      await api.delete(
        `/workspaces/${workspaceId}/layouts/${layoutSegment(resource.kind)}/${resource.id}`,
      );
      setLayoutExtensions((current) => current.filter((item) => item.id !== resource.id));
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Layout delete failed',
      );
    } finally {
      setLayoutDeletingId(null);
    }
  }

  async function toggle(extension: ExtensionDescriptor): Promise<void> {
    if (!canManage) return;
    setBusyId(extension.manifest.id);
    setError(null);
    try {
      await (extension.tenantEnabled
        ? api.post(`/extensions/${extension.manifest.id}/disable`)
        : api.post(`/extensions/${extension.manifest.id}/enable`, {
            configuration,
          }));
      setReloadKey((current) => current + 1);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  }

  async function saveConfiguration(extension: ExtensionDescriptor): Promise<void> {
    if (!canManage) return;
    const parsed = ExtensionConfigRequestSchema.safeParse({ configuration });
    if (!parsed.success) {
      setError('Configuration is invalid. Check each field and try again.');
      return;
    }
    setBusyId(extension.manifest.id);
    try {
      await api.patch(`/extensions/${extension.manifest.id}/config`, parsed.data);
      setSelectedId(null);
      setReloadKey((current) => current + 1);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Configuration failed',
      );
    } finally {
      setBusyId(null);
    }
  }

  function updateCustomDraft(field: keyof CustomExtensionDraft, value: string): void {
    setCustomDraft((current) => ({ ...current, [field]: value }));
  }

  function startCreateCustom(): void {
    setError(null);
    setCustomDraft(emptyCustomExtensionDraft);
    setCustomEditorMode('create');
  }

  function startEditCustom(extension: ExtensionDescriptor): void {
    if (!extension.custom) return;
    setError(null);
    setCustomDraft({
      id: extension.custom.id,
      name: extension.custom.name,
      version: extension.custom.version,
      description: extension.custom.description ?? '',
      eyebrow: extension.custom.render.eyebrow,
      heading: extension.custom.render.heading,
      body: extension.custom.render.body,
      buttonLabel: extension.custom.render.buttonLabel,
      buttonHref: extension.custom.render.buttonHref,
      accentColor: extension.custom.render.accentColor,
    });
    setCustomEditorMode('edit');
  }

  async function saveCustomExtension(): Promise<void> {
    if (!canManage || !customEditorMode) return;
    setError(null);
    const render = {
      kind: 'banner' as const,
      eyebrow: customDraft.eyebrow,
      heading: customDraft.heading,
      body: customDraft.body,
      buttonLabel: customDraft.buttonLabel,
      buttonHref: customDraft.buttonHref,
      accentColor: customDraft.accentColor,
    };
    const candidate =
      customEditorMode === 'create'
        ? {
            id: customDraft.id,
            name: customDraft.name,
            version: customDraft.version,
            description: customDraft.description || undefined,
            render,
          }
        : {
            name: customDraft.name,
            version: customDraft.version,
            description: customDraft.description || null,
            render,
          };
    const parsed =
      customEditorMode === 'create'
        ? CreateCustomExtensionRequestSchema.safeParse(candidate)
        : UpdateCustomExtensionRequestSchema.safeParse(candidate);
    if (!parsed.success) {
      setError('Custom extension data is invalid. Check the required fields and values.');
      return;
    }
    setBusyId(customDraft.id);
    try {
      if (customEditorMode === 'create') {
        await api.post('/extensions', parsed.data);
      } else {
        await api.patch(`/extensions/${customDraft.id}`, parsed.data);
      }
      setCustomEditorMode(null);
      setReloadKey((current) => current + 1);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Save failed');
    } finally {
      setBusyId(null);
    }
  }

  async function removeCustomExtension(extension: ExtensionDescriptor): Promise<void> {
    if (!canManage || !extension.custom) return;
    if (
      !window.confirm(
        `Delete ${extension.custom.name}? Existing page blocks must be removed first.`,
      )
    ) {
      return;
    }
    setBusyId(extension.manifest.id);
    setError(null);
    try {
      await api.delete(`/extensions/${extension.manifest.id}`);
      if (customEditorMode === 'edit' && customDraft.id === extension.manifest.id) {
        setCustomEditorMode(null);
      }
      setReloadKey((current) => current + 1);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Delete failed');
    } finally {
      setBusyId(null);
    }
  }

  async function openConnections(extensionId: string): Promise<void> {
    if (connectionsFor === extensionId) {
      setConnectionsFor(null);
      return;
    }
    setBusyId(extensionId);
    setError(null);
    try {
      const response = ExtensionConnectionListResponseSchema.parse(
        await api.get(`/extensions/${extensionId}/connections`),
      );
      setConnections((current) => ({ ...current, [extensionId]: response.items }));
      setConnectionsFor(extensionId);
      setConnectionDraft(emptyConnectionDraft);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Connections failed');
    } finally {
      setBusyId(null);
    }
  }

  function startEditConnection(connection: ExtensionConnection): void {
    setConnectionDraft({
      id: connection.id,
      name: connection.name,
      configuration: JSON.stringify(connection.configuration, null, 2),
      secret: '',
    });
  }

  async function saveConnection(extensionId: string): Promise<void> {
    if (!canManage) return;
    let configuration: unknown;
    try {
      configuration = JSON.parse(connectionDraft.configuration) as unknown;
    } catch {
      setError('Connection configuration must be valid JSON.');
      return;
    }
    const candidate = connectionDraft.id
      ? {
          name: connectionDraft.name,
          configuration,
          ...(connectionDraft.secret ? { secret: connectionDraft.secret } : {}),
        }
      : {
          name: connectionDraft.name,
          configuration,
          ...(connectionDraft.secret ? { secret: connectionDraft.secret } : {}),
        };
    const parsed = connectionDraft.id
      ? UpdateExtensionConnectionRequestSchema.safeParse(candidate)
      : CreateExtensionConnectionRequestSchema.safeParse(candidate);
    if (!parsed.success) {
      setError('Connection data is invalid. Check the name, configuration and secret.');
      return;
    }
    setBusyId(extensionId);
    setError(null);
    try {
      const response = connectionDraft.id
        ? await api.patch(
            `/extensions/${extensionId}/connections/${connectionDraft.id}`,
            parsed.data,
          )
        : await api.post(`/extensions/${extensionId}/connections`, parsed.data);
      const saved = ExtensionConnectionSchema.parse(response);
      setConnections((current) => ({
        ...current,
        [extensionId]: connectionDraft.id
          ? (current[extensionId] ?? []).map((item) =>
              item.id === saved.id ? saved : item,
            )
          : [...(current[extensionId] ?? []), saved],
      }));
      setConnectionDraft(emptyConnectionDraft);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Connection save failed',
      );
    } finally {
      setBusyId(null);
    }
  }

  async function removeConnection(
    extensionId: string,
    connection: ExtensionConnection,
  ): Promise<void> {
    if (!canManage || !window.confirm(`Delete ${connection.name}?`)) return;
    setBusyId(extensionId);
    setError(null);
    try {
      await api.delete(`/extensions/${extensionId}/connections/${connection.id}`);
      setConnections((current) => ({
        ...current,
        [extensionId]: (current[extensionId] ?? []).filter(
          (item) => item.id !== connection.id,
        ),
      }));
      if (connectionDraft.id === connection.id) setConnectionDraft(emptyConnectionDraft);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Connection delete failed',
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">Platform capabilities</span>
        <h1>Extensions</h1>
        <p className="muted">
          Manage trusted platform extensions and create declarative blocks for landing
          pages. Custom extensions are tenant-scoped and safe by design; they cannot run
          arbitrary server or browser code.
        </p>
      </div>
      {error ? (
        <div className="alert alert-error" role="alert">
          {error}{' '}
          <button
            className="button button-small button-ghost"
            onClick={() => setReloadKey((current) => current + 1)}
            type="button"
          >
            Retry
          </button>
        </div>
      ) : null}
      {loading ? (
        <section className="panel" aria-busy="true">
          <div className="skeleton skeleton-heading" />
          <div className="skeleton skeleton-copy" />
        </section>
      ) : (
        <>
          <section className="extension-overview" aria-label="Extension overview">
            <div className="extension-overview-copy">
              <span className="eyebrow">Trusted platform surface</span>
              <h2>Build pages from capabilities</h2>
              <p className="muted">
                Tenant enablement controls what this company can use. Page instances are
                configured inside the visual builder.
              </p>
            </div>
            <div className="extension-stat-grid">
              <div className="extension-stat">
                <span>Enabled</span>
                <strong>{enabledCount}</strong>
                <small>of {extensions.length} deployed</small>
              </div>
              <div className="extension-stat">
                <span>Capabilities</span>
                <strong>
                  {
                    new Set(extensions.flatMap((extension) => extension.capabilities))
                      .size
                  }
                </strong>
                <small>registered surfaces</small>
              </div>
              <div className="extension-stat">
                <span>Runtimes</span>
                <strong>{runtimeCount}</strong>
                <small>loaded on demand</small>
              </div>
            </div>
          </section>
          <section
            className="panel layout-extension-panel"
            aria-label="Header and footer extensions"
          >
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Layout extensions</span>
                <h2>Header &amp; Footer blocks</h2>
                <p className="muted">
                  Build these once, then drag a copy into any page from the builder’s
                  Extensions &amp; advanced group. Editing the source never changes an
                  existing page copy.
                </p>
              </div>
            </div>
            <div className="extension-layout-grid">
              {(['header', 'footer'] as const).map((kind) => {
                const resources = layoutExtensions.filter((item) => item.kind === kind);
                const label = kind === 'header' ? 'Header' : 'Footer';
                return (
                  <article className="extension-layout-card" key={kind}>
                    <div>
                      <span className="extension-mark" aria-hidden="true">
                        {label.slice(0, 1)}
                      </span>
                      <h3>{label} extensions</h3>
                      <p className="muted small">
                        {resources.length
                          ? `${resources.length} reusable ${label.toLowerCase()} resource${resources.length === 1 ? '' : 's'} for all sites in this workspace.`
                          : `No ${kind} extension has been built for this workspace yet.`}
                      </p>
                    </div>
                    <div className="form-actions">
                      {resources.length ? (
                        <button
                          className="button button-primary"
                          onClick={() => openLayoutMenu(kind)}
                          type="button"
                        >
                          Edit {label}
                        </button>
                      ) : (
                        <button
                          className="button button-primary"
                          disabled={!canManageLayouts}
                          onClick={() => startCreateLayout(kind)}
                          type="button"
                        >
                          Build {label}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
          {canManage ? (
            <section className="panel custom-extension-create-panel">
              <div>
                <span className="eyebrow">Custom extension</span>
                <h2>Create a reusable page block</h2>
                <p className="muted">
                  Define content, CTA and accent styling once, then place the block from
                  the visual builder on any page in this tenant.
                </p>
              </div>
              <button
                className="button button-primary"
                onClick={startCreateCustom}
                type="button"
              >
                Create custom extension
              </button>
            </section>
          ) : null}
          {customEditorMode ? (
            <section
              className="panel custom-extension-editor"
              aria-label="Custom extension editor"
            >
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">
                    {customEditorMode === 'create' ? 'New definition' : 'Edit definition'}
                  </span>
                  <h2>
                    {customEditorMode === 'create'
                      ? 'Create custom extension'
                      : customDraft.name}
                  </h2>
                </div>
                <button
                  className="button button-ghost"
                  onClick={() => setCustomEditorMode(null)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
              <div className="custom-extension-form-grid">
                {customEditorMode === 'create' ? (
                  <label>
                    Extension ID
                    <input
                      onChange={(event) => updateCustomDraft('id', event.target.value)}
                      placeholder="custom-hero-banner"
                      value={customDraft.id}
                    />
                    <small className="muted">Lowercase ID starting with custom-</small>
                  </label>
                ) : null}
                <label>
                  Name
                  <input
                    onChange={(event) => updateCustomDraft('name', event.target.value)}
                    placeholder="Spring launch banner"
                    value={customDraft.name}
                  />
                </label>
                <label>
                  Version
                  <input
                    onChange={(event) => updateCustomDraft('version', event.target.value)}
                    placeholder="1.0.0"
                    value={customDraft.version}
                  />
                </label>
                <label className="custom-extension-form-wide">
                  Description
                  <textarea
                    onChange={(event) =>
                      updateCustomDraft('description', event.target.value)
                    }
                    placeholder="What this block is for"
                    value={customDraft.description}
                  />
                </label>
                <label>
                  Eyebrow
                  <input
                    onChange={(event) => updateCustomDraft('eyebrow', event.target.value)}
                    placeholder="Limited release"
                    value={customDraft.eyebrow}
                  />
                </label>
                <label>
                  Accent color
                  <input
                    onChange={(event) =>
                      updateCustomDraft('accentColor', event.target.value)
                    }
                    type="text"
                    value={customDraft.accentColor}
                  />
                </label>
                <label className="custom-extension-form-wide">
                  Heading
                  <input
                    onChange={(event) => updateCustomDraft('heading', event.target.value)}
                    placeholder="Launch your next campaign"
                    value={customDraft.heading}
                  />
                </label>
                <label className="custom-extension-form-wide">
                  Body
                  <textarea
                    onChange={(event) => updateCustomDraft('body', event.target.value)}
                    placeholder="A short message shown on the page"
                    value={customDraft.body}
                  />
                </label>
                <label>
                  Button label
                  <input
                    onChange={(event) =>
                      updateCustomDraft('buttonLabel', event.target.value)
                    }
                    placeholder="Learn more"
                    value={customDraft.buttonLabel}
                  />
                </label>
                <label>
                  Button link
                  <input
                    onChange={(event) =>
                      updateCustomDraft('buttonHref', event.target.value)
                    }
                    placeholder="/contact or https://example.com"
                    value={customDraft.buttonHref}
                  />
                </label>
              </div>
              <div className="form-actions">
                <button
                  className="button button-primary"
                  disabled={busyId === customDraft.id}
                  onClick={() => void saveCustomExtension()}
                  type="button"
                >
                  {customEditorMode === 'create' ? 'Create extension' : 'Save changes'}
                </button>
              </div>
            </section>
          ) : null}
          <section className="panel extensions-panel">
            <div className="extension-toolbar">
              <label className="extension-search-field">
                <span className="eyebrow">Find an extension</span>
                <input
                  aria-label="Search extensions"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name, capability or ID"
                  value={search}
                />
              </label>
              <label className="extension-filter-field">
                <span className="eyebrow">Status</span>
                <select
                  aria-label="Extension status"
                  onChange={(event) =>
                    setStatusFilter(event.target.value as 'all' | 'enabled' | 'disabled')
                  }
                  value={statusFilter}
                >
                  <option value="all">All extensions</option>
                  <option value="enabled">Enabled only</option>
                  <option value="disabled">Disabled only</option>
                </select>
              </label>
              <span className="extension-result-count">
                {filteredExtensions.length} result
                {filteredExtensions.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="extension-list">
              {filteredExtensions.map((extension) => {
                const selected = selectedId === extension.manifest.id;
                const surfaces = contributionSurfaces(extension);
                return (
                  <article
                    className={`extension-card${extension.tenantEnabled ? ' is-enabled' : ''}`}
                    key={extension.manifest.id}
                  >
                    <div className="extension-card-main">
                      <div className="panel-heading">
                        <div>
                          <div className="extension-title-line">
                            <span className="extension-mark" aria-hidden="true">
                              {extension.manifest.name.slice(0, 1).toUpperCase()}
                            </span>
                            <div>
                              <h2>{extension.manifest.name}</h2>
                              <span className="muted small">
                                {extension.manifest.id} · v{extension.manifest.version}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="extension-status-stack">
                          <StatusBadge
                            label={extension.tenantEnabled ? 'Enabled' : 'Disabled'}
                            status={extension.tenantEnabled ? 'enabled' : 'disabled'}
                          />
                          <span className="extension-health">
                            <span
                              className={`extension-health-dot is-${extension.health}`}
                            />
                            {extension.health}
                          </span>
                        </div>
                      </div>
                      <p className="muted">{extension.manifest.description}</p>
                      <div
                        aria-label={`${extension.manifest.name} contributions`}
                        className="extension-surface-list"
                      >
                        {surfaces.map((surface) => (
                          <span className="extension-surface-chip" key={surface.label}>
                            <strong>{surface.count}</strong> {surface.label}
                          </span>
                        ))}
                        {extension.manifest.pageConfiguration ? (
                          <span className="extension-surface-chip is-page">
                            Page settings
                          </span>
                        ) : null}
                      </div>
                      <div className="extension-meta">
                        <span>
                          <strong>{extension.capabilities.length}</strong>{' '}
                          {extension.capabilities.length === 1
                            ? 'capability'
                            : 'capabilities'}
                        </span>
                        <span>
                          {extension.manifest.dependencies.length > 0
                            ? `${extension.manifest.dependencies.length} dependenc${extension.manifest.dependencies.length === 1 ? 'y' : 'ies'}`
                            : 'No dependencies'}
                        </span>
                      </div>
                    </div>
                    <div className="form-actions extension-actions">
                      {canManage ? (
                        <button
                          className={
                            extension.tenantEnabled
                              ? 'button button-danger'
                              : 'button button-primary'
                          }
                          disabled={busyId === extension.manifest.id}
                          onClick={() => void toggle(extension)}
                          type="button"
                        >
                          {extension.tenantEnabled ? 'Disable' : 'Enable'}
                        </button>
                      ) : null}
                      {extension.manifest.configuration ? (
                        <button
                          className="button button-ghost"
                          disabled={!canManage}
                          onClick={() =>
                            setSelectedId(selected ? null : extension.manifest.id)
                          }
                          type="button"
                        >
                          Configure
                        </button>
                      ) : null}
                      {extension.tenantEnabled ? (
                        <button
                          className="button button-ghost"
                          disabled={busyId === extension.manifest.id}
                          onClick={() => void openConnections(extension.manifest.id)}
                          type="button"
                        >
                          {connectionsFor === extension.manifest.id
                            ? 'Hide connections'
                            : 'Connections'}
                        </button>
                      ) : null}
                      {extension.custom ? (
                        <>
                          <button
                            className="button button-ghost"
                            disabled={busyId === extension.manifest.id}
                            onClick={() => startEditCustom(extension)}
                            type="button"
                          >
                            Edit
                          </button>
                          <button
                            className="button button-danger"
                            disabled={busyId === extension.manifest.id}
                            onClick={() => void removeCustomExtension(extension)}
                            type="button"
                          >
                            Delete
                          </button>
                        </>
                      ) : null}
                    </div>
                    {selected && extension.manifest.configuration ? (
                      <div className="extension-config-form">
                        {extension.manifest.configuration.fields.map((field) => (
                          <label key={field.key}>
                            {field.label}
                            <input
                              onChange={(event) =>
                                setConfiguration((current) => ({
                                  ...current,
                                  [field.key]: event.target.value,
                                }))
                              }
                              placeholder={field.description ?? field.key}
                              type={field.type === 'secret' ? 'password' : field.type}
                              value={String(configuration[field.key] ?? '')}
                            />
                          </label>
                        ))}
                        <button
                          className="button button-secondary"
                          disabled={busyId === extension.manifest.id}
                          onClick={() => void saveConfiguration(extension)}
                          type="button"
                        >
                          Save configuration
                        </button>
                      </div>
                    ) : null}
                    {connectionsFor === extension.manifest.id ? (
                      <div
                        aria-label={`${extension.manifest.name} connections`}
                        className="extension-config-form extension-connection-panel"
                      >
                        <div>
                          <span className="eyebrow">Tenant connections</span>
                          <p className="muted small">
                            Credentials are encrypted server-side. Only connection status
                            and safe configuration are returned to the CMS.
                          </p>
                        </div>
                        {(connections[extension.manifest.id] ?? []).map((connection) => (
                          <div className="extension-connection-row" key={connection.id}>
                            <span>
                              <strong>{connection.name}</strong>
                              <small>
                                {connection.status} ·{' '}
                                {connection.secretConfigured
                                  ? 'secret configured'
                                  : 'no secret'}
                              </small>
                            </span>
                            {canManage ? (
                              <span className="form-actions">
                                <button
                                  className="button button-small button-ghost"
                                  onClick={() => startEditConnection(connection)}
                                  type="button"
                                >
                                  Edit
                                </button>
                                <button
                                  className="button button-small button-danger"
                                  onClick={() =>
                                    void removeConnection(
                                      extension.manifest.id,
                                      connection,
                                    )
                                  }
                                  type="button"
                                >
                                  Delete
                                </button>
                              </span>
                            ) : null}
                          </div>
                        ))}
                        {canManage ? (
                          <>
                            <div className="custom-extension-form-grid">
                              <label>
                                Connection name
                                <input
                                  onChange={(event) =>
                                    setConnectionDraft((current) => ({
                                      ...current,
                                      name: event.target.value,
                                    }))
                                  }
                                  placeholder="Production account"
                                  value={connectionDraft.name}
                                />
                              </label>
                              <label>
                                Secret {connectionDraft.id ? '(leave blank to keep)' : ''}
                                <input
                                  onChange={(event) =>
                                    setConnectionDraft((current) => ({
                                      ...current,
                                      secret: event.target.value,
                                    }))
                                  }
                                  type="password"
                                  value={connectionDraft.secret}
                                />
                              </label>
                            </div>
                            <label>
                              Safe configuration (JSON)
                              <textarea
                                onChange={(event) =>
                                  setConnectionDraft((current) => ({
                                    ...current,
                                    configuration: event.target.value,
                                  }))
                                }
                                rows={3}
                                value={connectionDraft.configuration}
                              />
                            </label>
                            <div className="form-actions">
                              <button
                                className="button button-secondary"
                                disabled={busyId === extension.manifest.id}
                                onClick={() => void saveConnection(extension.manifest.id)}
                                type="button"
                              >
                                {connectionDraft.id
                                  ? 'Save connection'
                                  : 'Add connection'}
                              </button>
                              {connectionDraft.id ? (
                                <button
                                  className="button button-ghost"
                                  onClick={() => setConnectionDraft(emptyConnectionDraft)}
                                  type="button"
                                >
                                  Cancel edit
                                </button>
                              ) : null}
                            </div>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
              {filteredExtensions.length === 0 ? (
                <div className="extension-empty-state">
                  <span className="extension-empty-icon" aria-hidden="true">
                    <Icon name="search" />
                  </span>
                  <strong>No matching extensions</strong>
                  <span className="muted small">
                    Try another name, ID or status filter.
                  </span>
                </div>
              ) : null}
            </div>
          </section>
        </>
      )}
      {editingLayoutKind && workspaceId ? (
        <Drawer
          description={`Choose a ${editingLayoutKind} layout, then open its builder to edit the workspace-wide source.`}
          eyebrow="Layout extension"
          headerActions={
            <button
              className="button button-small button-primary"
              disabled={!canManageLayouts || layoutCreateOpen}
              onClick={() => startCreateLayout(editingLayoutKind)}
              type="button"
            >
              Add {editingLayoutKind === 'header' ? 'Header' : 'Footer'}
            </button>
          }
          onClose={() => {
            setLayoutCreateOpen(false);
            setEditingLayoutKind(null);
          }}
          open
          size="lg"
          title={`${editingLayoutKind === 'header' ? 'Header' : 'Footer'} layouts`}
        >
          <div className="stack">
            {error ? (
              <div className="alert alert-error" role="alert">
                {error}
              </div>
            ) : null}
            <p className="muted small">
              Select the {editingLayoutKind} layout you want to work on. The full visual
              builder opens in its own workspace after you choose Open builder.
            </p>
            {layoutCreateOpen ? (
              <form
                aria-label={`Add ${editingLayoutKind} layout`}
                className="inset-panel stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  void createLayoutExtension(editingLayoutKind);
                }}
              >
                <div>
                  <strong>
                    Add {editingLayoutKind === 'header' ? 'Header' : 'Footer'} layout
                  </strong>
                  <p className="muted small">
                    Enter the details for this workspace-wide layout before opening its
                    builder.
                  </p>
                </div>
                <label>
                  Name
                  <input
                    aria-label="Layout name"
                    autoFocus
                    maxLength={120}
                    onChange={(event) =>
                      setLayoutCreateDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    required
                    value={layoutCreateDraft.name}
                  />
                </label>
                <label>
                  Description <span className="muted">Optional</span>
                  <textarea
                    aria-label="Layout description"
                    maxLength={500}
                    onChange={(event) =>
                      setLayoutCreateDraft((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    rows={3}
                    value={layoutCreateDraft.description}
                  />
                </label>
                <div className="form-actions">
                  <button
                    className="button button-ghost"
                    onClick={() => setLayoutCreateOpen(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="button button-primary"
                    disabled={layoutBusy === editingLayoutKind}
                    type="submit"
                  >
                    {layoutBusy === editingLayoutKind ? 'Creating…' : 'Create layout'}
                  </button>
                </div>
              </form>
            ) : null}
            <div className="list" aria-label={`${editingLayoutKind} layouts`}>
              {layoutExtensions
                .filter((resource) => resource.kind === editingLayoutKind)
                .map((resource) => (
                  <div className="list-row" key={resource.id}>
                    <div>
                      <strong>{resource.name}</strong>
                      <span className="muted small">
                        {resource.draftVersionId
                          ? resource.publishedVersionId
                            ? 'Draft changes ready to review.'
                            : 'Draft ready to use in the builder.'
                          : resource.publishedVersionId
                            ? 'Published source.'
                            : 'No saved version yet.'}
                      </span>
                    </div>
                    <div className="row-actions">
                      <button
                        className="button button-small button-primary"
                        onClick={() => openLayoutBuilder(resource)}
                        type="button"
                      >
                        Open builder
                      </button>
                      <button
                        className="button button-small button-danger"
                        disabled={!canDeleteLayouts || layoutDeletingId === resource.id}
                        onClick={() => void removeLayoutExtension(resource)}
                        type="button"
                      >
                        {layoutDeletingId === resource.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </Drawer>
      ) : null}
    </>
  );
}

function contributionSurfaces(
  extension: ExtensionDescriptor,
): Array<{ label: string; count: number }> {
  const contribution = extension.manifest.contributions;
  const surfaces: Array<{ label: string; count: number }> = [];
  const typedCounts = new Map<string, number>();
  for (const entry of extension.contributionEntries) {
    const family = entry.type.split('.')[0] ?? entry.type;
    typedCounts.set(family, (typedCounts.get(family) ?? 0) + 1);
  }
  for (const [label, count] of typedCounts) {
    surfaces.push({ label: label[0]?.toUpperCase() + label.slice(1), count });
  }
  if (surfaces.length > 0) return surfaces;
  const builderCount =
    (contribution?.builder?.elements.length ?? 0) +
    (contribution?.builder?.blocks.length ?? 0);
  if (builderCount > 0) {
    surfaces.push({ label: 'Builder', count: builderCount });
  }
  if (contribution?.renderer?.runtimeIds.length) {
    surfaces.push({ label: 'Runtime', count: contribution.renderer.runtimeIds.length });
  }
  const formCount =
    (contribution?.forms?.fields.length ?? 0) +
    (contribution?.forms?.processors.length ?? 0) +
    (contribution?.forms?.destinations.length ?? 0);
  if (formCount > 0) {
    surfaces.push({ label: 'Forms', count: formCount });
  }
  const automationCount =
    (contribution?.automation?.triggers.length ?? 0) +
    (contribution?.automation?.actions.length ?? 0);
  if (automationCount > 0) {
    surfaces.push({ label: 'Automation', count: automationCount });
  }
  if (contribution?.analytics?.events.length) {
    surfaces.push({ label: 'Analytics', count: contribution.analytics.events.length });
  }
  if (surfaces.length === 0) {
    surfaces.push({ label: 'Events', count: extension.capabilities.length });
  }
  return surfaces;
}
