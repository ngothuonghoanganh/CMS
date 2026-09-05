'use client';

import {
  SiteListResponseSchema,
  SitePublishResponseSchema,
  type Site,
} from '@payload/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { useCmsShell } from '../cms-shell';
import { pagesPath, sitePath } from '../cms-routes';
import { ApiClientError, api } from '../lib/api';
import { StatusBadge } from '../status-badge';
import { Drawer, EmptyState, PageHeader, PaginationControls } from '../ui/surfaces';

type SiteForm = { name: string; slug: string };
const blankSite: SiteForm = { name: '', slug: '' };

function normalizeSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function SitesPage({
  action,
  siteId,
}: {
  action?: 'create' | 'edit';
  siteId?: string;
}) {
  const router = useRouter();
  const { workspaceId, can } = useCmsShell();
  const [sites, setSites] = useState<Site[]>([]);
  const [pagination, setPagination] = useState({
    limit: 100,
    offset: 0,
    total: 0,
    hasNextPage: false,
  });
  const [form, setForm] = useState<SiteForm>(blankSite);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedSite = sites.find((site) => site.id === siteId);
  const editLoading = action === 'edit' && (loading || !selectedSite);
  const publishedSiteCount = sites.filter((site) => site.status === 'published').length;
  const draftSiteCount = sites.filter((site) => site.status === 'draft').length;
  const archivedSiteCount = sites.filter((site) => site.status === 'archived').length;

  async function load(offset = pagination.offset) {
    setLoading(true);
    setError(null);
    try {
      const response = SiteListResponseSchema.parse(
        await api.get(`/workspaces/${workspaceId}/sites?limit=100&offset=${offset}`),
      );
      setSites(response.items);
      setPagination(response.pagination);
      const site = response.items.find((item) => item.id === siteId);
      if (site) setForm({ name: site.name, slug: site.slug });
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(0);
  }, [workspaceId]);

  useEffect(() => {
    if (action === 'create') setForm(blankSite);
    if (action === 'edit' && selectedSite) {
      setForm({ name: selectedSite.name, slug: selectedSite.slug });
    }
  }, [action, selectedSite]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (action === 'edit' && siteId) {
        const updated = await api.patch<Site>(
          `/workspaces/${workspaceId}/sites/${siteId}`,
          form,
        );
        setSites((current) =>
          current.map((site) => (site.id === updated.id ? updated : site)),
        );
        router.replace(sitePath(workspaceId, updated.id));
      } else {
        const created = await api.post<Site>(`/workspaces/${workspaceId}/sites`, {
          name: form.name,
          slug: form.slug || normalizeSlug(form.name),
        });
        router.push(sitePath(workspaceId, created.id));
      }
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setBusy(false);
    }
  }

  async function publish(site: Site) {
    setBusy(true);
    setError(null);
    try {
      const updated = SitePublishResponseSchema.parse(
        await api.post(`/workspaces/${workspaceId}/sites/${site.id}/publish`, {}),
      );
      setSites((current) =>
        current.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
      );
      setNotice('Site published.');
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setBusy(false);
    }
  }

  const isDetail = Boolean(siteId && !action);
  return (
    <>
      {isDetail ? (
        <SiteDetail
          loading={loading}
          site={selectedSite}
          canUpdate={can('site.update')}
          workspaceId={workspaceId}
        />
      ) : (
        <>
          <PageHeader
            actions={
              <button
                className="button button-primary"
                onClick={() => router.push(`${sitePath(workspaceId, 'new')}`)}
                type="button"
              >
                New site
              </button>
            }
            description="Create and maintain the destinations that own your pages."
            eyebrow="Workspace"
            title="Sites"
          />
          <section aria-label="Sites summary" className="sites-summary-grid">
            <div className="sites-summary-card sites-summary-card-primary">
              <div className="sites-summary-icon" aria-hidden="true">
                ◫
              </div>
              <div>
                <span className="eyebrow">Total sites</span>
                <strong>{pagination.total}</strong>
                <span className="muted">In this workspace</span>
              </div>
            </div>
            <div className="sites-summary-card">
              <div className="sites-summary-icon" aria-hidden="true">
                ↗
              </div>
              <div>
                <span className="eyebrow">Published</span>
                <strong>{publishedSiteCount}</strong>
                <span className="muted">Live destinations</span>
              </div>
            </div>
            <div className="sites-summary-card">
              <div className="sites-summary-icon" aria-hidden="true">
                ◌
              </div>
              <div>
                <span className="eyebrow">In progress</span>
                <strong>{draftSiteCount + archivedSiteCount}</strong>
                <span className="muted">Drafts and archived</span>
              </div>
            </div>
          </section>
          {error ? (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          ) : null}
          {notice ? (
            <div className="alert alert-success" role="status">
              {notice}
            </div>
          ) : null}
          <section className="panel sites-list-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Workspace portfolio</span>
                <h2>Your sites</h2>
              </div>
              <span className="count-badge">{pagination.total}</span>
            </div>
            <p className="panel-description">
              Manage each destination, its public URL and the content it delivers.
            </p>
            {loading ? (
              <div aria-busy="true" className="analytics-skeleton">
                Loading sites…
              </div>
            ) : sites.length ? (
              <div className="table-shell">
                <table className="resource-table">
                  <thead>
                    <tr>
                      <th>Site</th>
                      <th>Published URL</th>
                      <th>Status</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sites.map((site) => (
                      <tr className="site-table-row" key={site.id}>
                        <td className="site-name-cell">
                          <a
                            className="site-name-link"
                            href={sitePath(workspaceId, site.id)}
                          >
                            <span aria-hidden="true" className="site-avatar">
                              {initials(site.name)}
                            </span>
                            <span className="site-name-copy">
                              <strong>{site.name}</strong>
                              <span>/{site.slug}</span>
                            </span>
                          </a>
                        </td>
                        <td className="site-url-cell">
                          {site.officialUrl ? (
                            <a
                              className="site-url-link"
                              href={site.officialUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <span>{site.officialUrl}</span>{' '}
                              <span aria-hidden="true">↗</span>
                            </a>
                          ) : (
                            <span className="site-url-empty">Not published yet</span>
                          )}
                        </td>
                        <td className="site-status-cell">
                          {site.status === 'published' ? (
                            <button
                              className="button button-small button-primary"
                              disabled
                              type="button"
                            >
                              Published
                            </button>
                          ) : (
                            <StatusBadge status={site.status} />
                          )}
                        </td>
                        <td>
                          <div className="row-menu site-row-actions">
                            <button
                              className="button button-small button-ghost"
                              onClick={() =>
                                router.push(`${sitePath(workspaceId, site.id)}/edit`)
                              }
                              type="button"
                            >
                              Edit
                            </button>
                            {can('site.publish') ? (
                              <button
                                className="button button-small button-primary"
                                disabled={busy || site.status === 'published'}
                                onClick={() => void publish(site)}
                                type="button"
                              >
                                {site.status === 'published'
                                  ? 'Published'
                                  : 'Publish site'}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                description="Your site list will appear here."
                title="No sites found"
              />
            )}
            {pagination.total ? (
              <PaginationControls
                busy={loading}
                noun="sites"
                onNext={() => void load(pagination.offset + pagination.limit)}
                onPrevious={() =>
                  void load(Math.max(0, pagination.offset - pagination.limit))
                }
                pagination={pagination}
              />
            ) : null}
          </section>
        </>
      )}
      {action ? (
        <Drawer
          description="A site owns pages, collections and delivery settings."
          footer={
            <div className="form-actions">
              <button
                className="button button-primary"
                disabled={busy || editLoading}
                form="site-metadata-form"
                type="submit"
              >
                {busy ? 'Saving…' : siteId ? 'Save changes' : 'Create site'}
              </button>
              <button
                className="button button-ghost"
                onClick={() =>
                  router.replace(
                    siteId
                      ? sitePath(workspaceId, siteId)
                      : `${sitePath(workspaceId, '')}`.replace(/\/$/, ''),
                  )
                }
                type="button"
              >
                Cancel
              </button>
            </div>
          }
          onClose={() =>
            router.replace(
              siteId
                ? sitePath(workspaceId, siteId)
                : `${sitePath(workspaceId, '')}`.replace(/\/$/, ''),
            )
          }
          open
          title={siteId ? 'Edit site' : 'Create site'}
        >
          {editLoading ? (
            <div aria-busy="true" className="analytics-skeleton">
              Loading site…
            </div>
          ) : (
            <form
              className="stack"
              id="site-metadata-form"
              onSubmit={(event) => void submit(event)}
            >
              <label>
                Site name
                <input
                  aria-label="Site name"
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  required
                  value={form.name}
                />
              </label>
              <label>
                Slug
                <input
                  aria-label="Slug"
                  onChange={(event) =>
                    setForm({ ...form, slug: normalizeSlug(event.target.value) })
                  }
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  placeholder="my-site"
                  required
                  value={form.slug}
                />
              </label>
              <p className="helper-text">
                Public URL: <code>/{form.slug || 'site-slug'}</code>
              </p>
            </form>
          )}
        </Drawer>
      ) : null}
    </>
  );
}

function SiteDetail({
  loading,
  site,
  canUpdate,
  workspaceId,
}: {
  loading: boolean;
  site: Site | undefined;
  canUpdate: boolean;
  workspaceId: string;
}) {
  const router = useRouter();
  if (loading && !site) {
    return (
      <section aria-busy="true" className="site-detail-loading">
        <div className="site-detail-loading-mark" />
        <div>
          <span className="eyebrow">Site</span>
          <strong>Loading site…</strong>
          <span className="muted">Preparing site details and quick actions.</span>
        </div>
      </section>
    );
  }
  if (!site)
    return (
      <EmptyState
        description="This site may have been removed or is still loading."
        title="Site not found"
      />
    );
  return (
    <>
      <PageHeader
        actions={
          <button
            className="button button-primary"
            disabled={!canUpdate}
            onClick={() => router.push(`${sitePath(workspaceId, site.id)}/edit`)}
            type="button"
          >
            Edit site
          </button>
        }
        description={`/${site.slug} · Manage this site's content, design, and delivery.`}
        eyebrow="Site"
        title={site.name}
      />
      <section className="panel site-detail-panel">
        <div className="site-detail-hero">
          <div className="site-detail-identity">
            <div aria-hidden="true" className="site-detail-avatar">
              {initials(site.name)}
            </div>
            <div>
              <span className="eyebrow">Site workspace</span>
              <strong>{site.name}</strong>
              <span className="muted">/{site.slug}</span>
            </div>
          </div>
          <StatusBadge label={site.status} status={site.status} />
        </div>
        <div className="site-detail-summary">
          <div>
            <span className="eyebrow">Publication</span>
            <strong className="site-detail-value">{site.status}</strong>
          </div>
          <div>
            <span className="eyebrow">Public URL</span>
            {site.officialUrl ? (
              <a
                className="text-link"
                href={site.officialUrl}
                target="_blank"
                rel="noreferrer"
              >
                {site.officialUrl} ↗
              </a>
            ) : (
              <span className="muted">Not published</span>
            )}
          </div>
          <div>
            <span className="eyebrow">Last updated</span>
            <span>{new Date(site.updatedAt).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="site-detail-section-heading">
          <div>
            <span className="eyebrow">Workspace tools</span>
            <h2>Manage this site</h2>
          </div>
          <span className="muted">Choose a surface to continue</span>
        </div>
        <div className="site-detail-links">
          <button
            className="button button-secondary"
            onClick={() => router.push(pagesPath(workspaceId, site.id))}
            type="button"
          >
            Manage pages
          </button>
          <button
            className="button button-secondary"
            onClick={() => router.push(`${sitePath(workspaceId, site.id)}/collections`)}
            type="button"
          >
            Collections
          </button>
          <button
            className="button button-secondary"
            onClick={() => router.push(`${sitePath(workspaceId, site.id)}/navigation`)}
            type="button"
          >
            Navigation
          </button>
          <button
            className="button button-secondary"
            onClick={() => router.push(`${sitePath(workspaceId, site.id)}/design-system`)}
            type="button"
          >
            Design system
          </button>
        </div>
      </section>
    </>
  );
}

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function errorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.message : 'Unable to load sites.';
}
