'use client';

import {
  LayoutExtensionListResponseSchema,
  LayoutExtensionResourceSchema,
  LayoutExtensionVersionsResponseSchema,
  type LayoutExtensionKind,
  type LayoutExtensionResource,
  type LayoutExtensionVersion,
} from '@payload/contracts';
import { useEffect, useState, type FormEvent } from 'react';

import { ApiClientError, api } from './lib/api';
import { PageHeader, ResourceToolbar } from './ui/surfaces';

type LayoutKindSegment = 'headers' | 'footers';
type LayoutForm = {
  kind: LayoutExtensionKind;
  name: string;
  description: string;
};

const blankForm: LayoutForm = { kind: 'header', name: '', description: '' };

function kindSegment(kind: LayoutExtensionKind): LayoutKindSegment {
  return kind === 'header' ? 'headers' : 'footers';
}

function kindLabel(kind: LayoutExtensionKind): string {
  return kind === 'header' ? 'Header' : 'Footer';
}

function resourceStatus(resource: LayoutExtensionResource): string {
  if (resource.draftVersionId && resource.publishedVersionId)
    return 'Live · draft changes';
  if (resource.draftVersionId) return 'Draft · not published';
  if (resource.publishedVersionId) return 'Live';
  return 'No version';
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  return error instanceof Error
    ? error.message
    : 'The layout operation could not be completed.';
}

export function LayoutExtensionsView({
  siteId,
  canCreate,
  canDelete,
  canRead,
  canPublish,
  canUpdate,
  onOpenBuilder,
}: {
  siteId: string;
  canCreate: boolean;
  canDelete: boolean;
  canRead: boolean;
  canPublish: boolean;
  canUpdate: boolean;
  onOpenBuilder: (resource: LayoutExtensionResource) => void;
}) {
  const [resources, setResources] = useState<LayoutExtensionResource[]>([]);
  const [form, setForm] = useState<LayoutForm>(blankForm);
  const [versions, setVersions] = useState<Record<string, LayoutExtensionVersion[]>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    if (!siteId) return;
    setLoading(true);
    setError(null);
    try {
      const [headers, footers] = await Promise.all([
        api.get(`/sites/${siteId}/layouts/headers`),
        api.get(`/sites/${siteId}/layouts/footers`),
      ]);
      setResources([
        ...LayoutExtensionListResponseSchema.parse(headers).items,
        ...LayoutExtensionListResponseSchema.parse(footers).items,
      ]);
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [siteId]);

  async function create(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canCreate || !form.name.trim()) return;
    setBusyId('create');
    setError(null);
    setNotice(null);
    try {
      const created = LayoutExtensionResourceSchema.parse(
        await api.post(`/sites/${siteId}/layouts/${kindSegment(form.kind)}`, {
          kind: form.kind,
          name: form.name.trim(),
          ...(form.description.trim() ? { description: form.description.trim() } : {}),
        }),
      );
      setResources((current) => [...current, created]);
      setForm(blankForm);
      setNotice(`${kindLabel(created.kind)} “${created.name}” created as a draft.`);
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setBusyId(null);
    }
  }

  async function publish(resource: LayoutExtensionResource): Promise<void> {
    setBusyId(resource.id);
    setError(null);
    setNotice(null);
    try {
      const updated = LayoutExtensionResourceSchema.parse(
        await api.post(
          `/sites/${siteId}/layouts/${kindSegment(resource.kind)}/${resource.id}/publish`,
          {},
        ),
      );
      setResources((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice(`${kindLabel(resource.kind)} “${resource.name}” is now live.`);
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setBusyId(null);
    }
  }

  async function discard(resource: LayoutExtensionResource): Promise<void> {
    if (!window.confirm(`Discard the unpublished draft for “${resource.name}”?`)) return;
    setBusyId(resource.id);
    setError(null);
    setNotice(null);
    try {
      const updated = LayoutExtensionResourceSchema.parse(
        await api.post(
          `/sites/${siteId}/layouts/${kindSegment(resource.kind)}/${resource.id}/discard`,
          {},
        ),
      );
      setResources((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice(
        `Discarded the unpublished ${kindLabel(resource.kind).toLowerCase()} draft.`,
      );
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(resource: LayoutExtensionResource): Promise<void> {
    if (
      !window.confirm(`Delete “${resource.name}”? It must not be attached to any page.`)
    ) {
      return;
    }
    setBusyId(resource.id);
    setError(null);
    setNotice(null);
    try {
      await api.delete(
        `/sites/${siteId}/layouts/${kindSegment(resource.kind)}/${resource.id}`,
      );
      setResources((current) => current.filter((item) => item.id !== resource.id));
      setNotice(`${kindLabel(resource.kind)} “${resource.name}” deleted.`);
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setBusyId(null);
    }
  }

  async function duplicate(resource: LayoutExtensionResource): Promise<void> {
    setBusyId(resource.id);
    setError(null);
    setNotice(null);
    try {
      const created = LayoutExtensionResourceSchema.parse(
        await api.post(
          `/sites/${siteId}/layouts/${kindSegment(resource.kind)}/${resource.id}/duplicate`,
          {},
        ),
      );
      setResources((current) => [...current, created]);
      setNotice(`${kindLabel(resource.kind)} “${resource.name}” duplicated.`);
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setBusyId(null);
    }
  }

  async function toggleVersions(resource: LayoutExtensionResource): Promise<void> {
    if (versions[resource.id]) {
      setVersions((current) => {
        const next = { ...current };
        delete next[resource.id];
        return next;
      });
      return;
    }
    setBusyId(resource.id);
    setError(null);
    try {
      const response = await api.get(
        `/sites/${siteId}/layouts/${kindSegment(resource.kind)}/${resource.id}/versions`,
      );
      setVersions((current) => ({
        ...current,
        [resource.id]: LayoutExtensionVersionsResponseSchema.parse(response).items,
      }));
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setBusyId(null);
    }
  }

  const headers = resources.filter((resource) => resource.kind === 'header');
  const footers = resources.filter((resource) => resource.kind === 'footer');

  return (
    <>
      <PageHeader
        eyebrow="Page composition"
        title="Headers & Footers"
        description="Build reusable layout resources, publish them independently, then attach them to the pages that need them."
      />
      <ResourceToolbar>
        <span className="muted small">Site-specific layout resources</span>
        <button
          className="button button-ghost button-small"
          onClick={() => void refresh()}
          type="button"
        >
          Refresh
        </button>
      </ResourceToolbar>
      {error ? (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="alert alert-success" role="status">
          {notice}
        </p>
      ) : null}
      <div className="two-column">
        <section className="panel">
          <div className="panel-heading">
            <h2>Create layout</h2>
          </div>
          <form className="stack" onSubmit={(event) => void create(event)}>
            <label>
              Layout type
              <select
                aria-label="Layout type"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    kind: event.target.value === 'footer' ? 'footer' : 'header',
                  }))
                }
                value={form.kind}
              >
                <option value="header">Header</option>
                <option value="footer">Footer</option>
              </select>
            </label>
            <label>
              Name
              <input
                aria-label="Layout name"
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                required
                value={form.name}
              />
            </label>
            <label>
              Description <span className="muted">Optional</span>
              <textarea
                aria-label="Layout description"
                maxLength={500}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                rows={3}
                value={form.description}
              />
            </label>
            <button
              className="button button-primary"
              disabled={!canCreate || busyId === 'create'}
              type="submit"
            >
              {busyId === 'create' ? 'Creating…' : 'Create layout'}
            </button>
          </form>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>How layouts work</h2>
          </div>
          <p className="muted">
            Layouts are not automatically applied to a site. Open a page and choose the
            Header/Footer it should render. Publishing a referenced layout updates those
            pages without republishing their body.
          </p>
        </section>
      </div>
      <div className="two-column">
        <LayoutList
          busyId={busyId}
          canPublish={canPublish}
          canCreate={canCreate}
          canDelete={canDelete}
          canRead={canRead}
          canUpdate={canUpdate}
          items={headers}
          kind="header"
          onDiscard={discard}
          onOpenBuilder={onOpenBuilder}
          onPublish={publish}
          onRemove={remove}
          onDuplicate={duplicate}
          onToggleVersions={toggleVersions}
          versions={versions}
        />
        <LayoutList
          busyId={busyId}
          canPublish={canPublish}
          canCreate={canCreate}
          canDelete={canDelete}
          canRead={canRead}
          canUpdate={canUpdate}
          items={footers}
          kind="footer"
          onDiscard={discard}
          onOpenBuilder={onOpenBuilder}
          onPublish={publish}
          onRemove={remove}
          onDuplicate={duplicate}
          onToggleVersions={toggleVersions}
          versions={versions}
        />
      </div>
      {loading ? (
        <p className="muted" aria-busy="true">
          Loading layouts…
        </p>
      ) : null}
    </>
  );
}

function LayoutList({
  busyId,
  canCreate,
  canDelete,
  canRead,
  canPublish,
  canUpdate,
  items,
  kind,
  onDiscard,
  onOpenBuilder,
  onPublish,
  onRemove,
  onDuplicate,
  onToggleVersions,
  versions,
}: {
  busyId: string | null;
  canCreate: boolean;
  canDelete: boolean;
  canRead: boolean;
  canPublish: boolean;
  canUpdate: boolean;
  items: LayoutExtensionResource[];
  kind: LayoutExtensionKind;
  onDiscard: (resource: LayoutExtensionResource) => Promise<void>;
  onOpenBuilder: (resource: LayoutExtensionResource) => void;
  onPublish: (resource: LayoutExtensionResource) => Promise<void>;
  onRemove: (resource: LayoutExtensionResource) => Promise<void>;
  onDuplicate: (resource: LayoutExtensionResource) => Promise<void>;
  onToggleVersions: (resource: LayoutExtensionResource) => Promise<void>;
  versions: Record<string, LayoutExtensionVersion[]>;
}) {
  const label = kindLabel(kind);
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">{label}</span>
          <h2>{label}s</h2>
        </div>
        <span className="pill">{items.length}</span>
      </div>
      {items.length ? (
        <div className="list">
          {items.map((resource) => (
            <div className="list-row" key={resource.id}>
              <div>
                <strong>{resource.name}</strong>
                <span className="muted">
                  {resource.description || resourceStatus(resource)}
                </span>
                <span className="muted small">{resourceStatus(resource)}</span>
                {versions[resource.id] ? (
                  <div className="stack compact-stack">
                    {(versions[resource.id] ?? []).map((version) => (
                      <span className="muted small" key={version.id}>
                        Version {version.versionNumber} · {version.status}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="row-actions">
                <button
                  className="button button-small button-primary"
                  disabled={!canUpdate && !canRead}
                  onClick={() => onOpenBuilder(resource)}
                  type="button"
                >
                  {canUpdate ? 'Edit' : 'Review'}
                </button>
                <button
                  className="button button-small"
                  disabled={busyId === resource.id}
                  onClick={() => void onToggleVersions(resource)}
                  type="button"
                >
                  {versions[resource.id] ? 'Hide versions' : 'Versions'}
                </button>
                {resource.draftVersionId ? (
                  <button
                    className="button button-small button-success"
                    disabled={!canPublish || busyId === resource.id}
                    onClick={() => void onPublish(resource)}
                    type="button"
                  >
                    Publish
                  </button>
                ) : null}
                {resource.draftVersionId && resource.publishedVersionId ? (
                  <button
                    className="button button-small button-ghost"
                    disabled={!canUpdate || busyId === resource.id}
                    onClick={() => void onDiscard(resource)}
                    type="button"
                  >
                    Discard draft
                  </button>
                ) : null}
                <button
                  className="button button-small"
                  disabled={!canCreate || busyId === resource.id}
                  onClick={() => void onDuplicate(resource)}
                  type="button"
                >
                  Duplicate
                </button>
                <button
                  className="button button-small button-danger"
                  disabled={!canDelete || busyId === resource.id}
                  onClick={() => void onRemove(resource)}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">No {label.toLowerCase()} resources yet.</p>
      )}
    </section>
  );
}
