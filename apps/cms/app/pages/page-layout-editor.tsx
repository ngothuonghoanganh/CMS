'use client';

import {
  LayoutExtensionListResponseSchema,
  LayoutExtensionResourceSchema,
  PageLayoutUpdateRequestSchema,
  type LayoutExtensionKind,
  type LayoutExtensionResource,
  type Page,
  type PageLayoutAttachment,
  type PageLayoutSlot,
} from '@payload/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { ApiClientError, api } from '../lib/api';

function kindSegment(kind: LayoutExtensionKind): 'headers' | 'footers' {
  return kind === 'header' ? 'headers' : 'footers';
}

function kindLabel(kind: LayoutExtensionKind): string {
  return kind === 'header' ? 'Header' : 'Footer';
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

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  return error instanceof Error ? error.message : 'The page layout could not be updated.';
}

function selectedResourceId(
  attachments: PageLayoutAttachment[],
  type: 'header' | 'footer',
): string {
  return (
    attachments.find((attachment) => attachment.type === type && attachment.enabled)
      ?.resourceId ?? ''
  );
}

export function PageLayoutEditor({
  canUpdate,
  page,
}: {
  canUpdate: boolean;
  page: Page;
}) {
  const router = useRouter();
  const [attachments, setAttachments] = useState<PageLayoutAttachment[]>([]);
  const [headers, setHeaders] = useState<LayoutExtensionResource[]>([]);
  const [footers, setFooters] = useState<LayoutExtensionResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newLayout, setNewLayout] = useState<{
    kind: LayoutExtensionKind;
    name: string;
    description: string;
  }>({ kind: 'header', name: '', description: '' });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [layout, headerResponse, footerResponse] = await Promise.all([
          api.get(`/pages/${page.id}/layout`),
          api.get(`/sites/${page.siteId}/layouts/headers`),
          api.get(`/sites/${page.siteId}/layouts/footers`),
        ]);
        if (cancelled) return;
        setAttachments(PageLayoutUpdateRequestSchema.parse(layout).attachments);
        setHeaders(LayoutExtensionListResponseSchema.parse(headerResponse).items);
        setFooters(LayoutExtensionListResponseSchema.parse(footerResponse).items);
      } catch (caughtError) {
        if (!cancelled) setError(errorMessage(caughtError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [page.id, page.siteId]);

  function setResource(type: 'header' | 'footer', resourceId: string): void {
    setAttachments((current) => {
      const existing = current.find((attachment) => attachment.type === type);
      if (!resourceId) return current.filter((attachment) => attachment.type !== type);
      const slot: PageLayoutSlot =
        existing?.slot ?? (type === 'header' ? 'page.header.top' : 'page.footer.bottom');
      const attachment: PageLayoutAttachment = {
        id: existing?.id ?? newAttachmentId(),
        type,
        resourceId,
        slot,
        enabled: true,
      };
      return [...current.filter((candidate) => candidate.type !== type), attachment];
    });
  }

  function setHeaderSlot(slot: PageLayoutSlot): void {
    setAttachments((current) =>
      current.map((attachment) =>
        attachment.type === 'header' ? { ...attachment, slot } : attachment,
      ),
    );
  }

  async function createLayout(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canUpdate || !newLayout.name.trim()) return;
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      const created = LayoutExtensionResourceSchema.parse(
        await api.post(`/sites/${page.siteId}/layouts/${kindSegment(newLayout.kind)}`, {
          kind: newLayout.kind,
          name: newLayout.name.trim(),
          ...(newLayout.description.trim()
            ? { description: newLayout.description.trim() }
            : {}),
        }),
      );
      if (created.kind === 'header') setHeaders((current) => [...current, created]);
      else setFooters((current) => [...current, created]);
      setNewLayout({ kind: newLayout.kind, name: '', description: '' });
      setNotice(`${kindLabel(created.kind)} created. Open its builder to add blocks.`);
      openBuilder(created);
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setCreating(false);
    }
  }

  function openBuilder(resource: LayoutExtensionResource): void {
    router.push(
      `/workspaces/${page.workspaceId}/sites/${page.siteId}/layouts/${kindSegment(resource.kind)}/${resource.id}/builder?returnPageId=${encodeURIComponent(page.id)}`,
    );
  }

  async function save(): Promise<void> {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await api.patch(`/pages/${page.id}/layout`, { attachments });
      setAttachments(PageLayoutUpdateRequestSchema.parse(response).attachments);
      setNotice(
        'Page layout saved. Draft preview resolves these layout drafts; public pages use published layouts.',
      );
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setSaving(false);
    }
  }

  const headerAttachment = attachments.find((attachment) => attachment.type === 'header');

  return (
    <section className="panel page-secondary-panel" aria-label="Page layout attachments">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Page composition</span>
          <h2>Header & Footer</h2>
        </div>
        {loading ? <span className="muted small">Loading…</span> : null}
      </div>
      <p className="muted small">
        This page renders only the layouts selected here. Changing a layout resource does
        not change pages until that resource is published.
      </p>
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
      <div className="page-layout-grid">
        <div className="page-layout-attachment-card">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Attached to this page</span>
              <h3>Choose layouts</h3>
            </div>
          </div>
          <div className="stack">
            <label>
              Header
              <select
                aria-label="Page header"
                disabled={loading || !canUpdate}
                onChange={(event) => setResource('header', event.target.value)}
                value={selectedResourceId(attachments, 'header')}
              >
                <option value="">No header</option>
                {headers.map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resource.name}
                  </option>
                ))}
              </select>
            </label>
            {headerAttachment ? (
              <label>
                Header placement
                <select
                  aria-label="Header placement"
                  disabled={!canUpdate}
                  onChange={(event) =>
                    setHeaderSlot(event.target.value as PageLayoutSlot)
                  }
                  value={headerAttachment.slot}
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
                aria-label="Page footer"
                disabled={loading || !canUpdate}
                onChange={(event) => setResource('footer', event.target.value)}
                value={selectedResourceId(attachments, 'footer')}
              >
                <option value="">No footer</option>
                {footers.map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resource.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="row-actions">
              <button
                className="button button-primary button-small"
                disabled={loading || saving || !canUpdate}
                onClick={() => void save()}
                type="button"
              >
                {saving ? 'Saving…' : 'Save layout'}
              </button>
              {headerAttachment ? (
                <button
                  className="button button-ghost button-small"
                  onClick={() => {
                    const resource = headers.find(
                      (candidate) => candidate.id === headerAttachment.resourceId,
                    );
                    if (resource) openBuilder(resource);
                  }}
                  type="button"
                >
                  Edit header blocks
                </button>
              ) : null}
              {selectedResourceId(attachments, 'footer') ? (
                <button
                  className="button button-ghost button-small"
                  onClick={() => {
                    const resource = footers.find(
                      (candidate) =>
                        candidate.id === selectedResourceId(attachments, 'footer'),
                    );
                    if (resource) openBuilder(resource);
                  }}
                  type="button"
                >
                  Edit footer blocks
                </button>
              ) : null}
            </div>
          </div>
        </div>
        <div className="page-layout-resource-card">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Reusable resources</span>
              <h3>Build a Header or Footer</h3>
            </div>
          </div>
          <form className="stack" onSubmit={(event) => void createLayout(event)}>
            <label>
              Type
              <select
                aria-label="New layout type"
                disabled={!canUpdate || creating}
                onChange={(event) =>
                  setNewLayout((current) => ({
                    ...current,
                    kind: event.target.value === 'footer' ? 'footer' : 'header',
                  }))
                }
                value={newLayout.kind}
              >
                <option value="header">Header</option>
                <option value="footer">Footer</option>
              </select>
            </label>
            <label>
              Name
              <input
                aria-label="New layout name"
                disabled={!canUpdate || creating}
                onChange={(event) =>
                  setNewLayout((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Marketing header"
                required
                value={newLayout.name}
              />
            </label>
            <label>
              Description <span className="muted">Optional</span>
              <textarea
                aria-label="New layout description"
                disabled={!canUpdate || creating}
                onChange={(event) =>
                  setNewLayout((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                rows={2}
                value={newLayout.description}
              />
            </label>
            <button
              className="button button-secondary button-small"
              disabled={!canUpdate || creating || !newLayout.name.trim()}
              type="submit"
            >
              {creating ? 'Creating…' : 'Create and build'}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
