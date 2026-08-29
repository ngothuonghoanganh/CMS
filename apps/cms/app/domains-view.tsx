'use client';

import type { CustomDomain, Page, Site } from '@payload/contracts';
import { useState, type FormEvent } from 'react';

import { Modal, PageHeader } from './ui/surfaces';

type DomainForm = {
  hostname: string;
  siteId: string;
  landingPageId: string;
  isPrimary: boolean;
};

export function DomainsView({
  domains,
  pages,
  sites,
  form,
  busy,
  onChange,
  onSubmit,
  onVerify,
  onUpdate,
  onRemove,
}: {
  domains: CustomDomain[];
  pages: Page[];
  sites: Site[];
  form: DomainForm;
  busy: boolean;
  onChange: (form: DomainForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onVerify: (domain: CustomDomain) => void;
  onUpdate: (
    domain: CustomDomain,
    input: { landingPageId: string | null; isPrimary: boolean },
  ) => void;
  onRemove: (domain: CustomDomain) => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <>
      <PageHeader
        actions={
          <button
            className="button button-primary"
            onClick={() => setCreateOpen(true)}
            type="button"
          >
            Add domain
          </button>
        }
        eyebrow="Settings"
        title="Domains"
        description="Connect a verified hostname to a published site or keep the legacy page assignment. TLS remains the responsibility of your edge or hosting provider."
      />
      <section className="panel">
        <PanelTitle title="Configured domains" count={domains.length} />
        {domains.length ? (
          <div className="list">
            {domains.map((domain) => (
              <DomainRow
                domain={domain}
                key={domain.id}
                pages={pages}
                busy={busy}
                onVerify={onVerify}
                onUpdate={onUpdate}
                onRemove={onRemove}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No custom domains"
            description="Add a domain to receive DNS ownership instructions."
          />
        )}
      </section>
      <Modal
        description="Enter a hostname only, without https:// or a path."
        eyebrow="Settings"
        footer={
          <>
            <button
              className="button button-ghost"
              onClick={() => setCreateOpen(false)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="button button-primary"
              disabled={busy}
              form="create-domain-form"
              type="submit"
            >
              {busy ? 'Adding…' : 'Add domain'}
            </button>
          </>
        }
        onClose={() => setCreateOpen(false)}
        open={createOpen}
        size="md"
        title="Add a custom domain"
      >
        <form
          className="stack"
          id="create-domain-form"
          onSubmit={(event) => {
            onSubmit(event);
            setCreateOpen(false);
          }}
        >
          <label>
            Hostname
            <input
              aria-describedby="domain-help"
              placeholder="www.example.com"
              value={form.hostname}
              onChange={(event) => onChange({ ...form, hostname: event.target.value })}
              required
            />
          </label>
          <span className="muted small" id="domain-help">
            Enter a hostname only, without https:// or a path.
          </span>
          <label>
            Site <span className="muted">(recommended)</span>
            <select
              value={form.siteId}
              onChange={(event) => onChange({ ...form, siteId: event.target.value })}
            >
              <option value="">Choose a site later</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Page <span className="muted">(optional until verification)</span>
            <select
              aria-label="Page"
              value={form.landingPageId}
              onChange={(event) =>
                onChange({ ...form, landingPageId: event.target.value })
              }
            >
              <option value="">Choose a page later</option>
              {pages.map((page) => (
                <option key={page.id} value={page.id}>
                  {page.name} {page.slug ? `(/${page.slug})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-field">
            <input
              checked={form.isPrimary}
              onChange={(event) => onChange({ ...form, isPrimary: event.target.checked })}
              type="checkbox"
            />
            <span>Use as the canonical primary domain for this page</span>
          </label>
        </form>
      </Modal>
    </>
  );
}

function DomainRow({
  domain,
  pages,
  busy,
  onVerify,
  onUpdate,
  onRemove,
}: {
  domain: CustomDomain;
  pages: Page[];
  busy: boolean;
  onVerify: (domain: CustomDomain) => void;
  onUpdate: (
    domain: CustomDomain,
    input: { landingPageId: string | null; isPrimary: boolean },
  ) => void;
  onRemove: (domain: CustomDomain) => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    landingPageId: domain.landingPageId ?? '',
    isPrimary: domain.isPrimary,
  });
  const page = pages.find((candidate) => candidate.id === domain.landingPageId);
  return (
    <div className="list-row" data-domain-hostname={domain.hostname}>
      <div className="stack compact-stack">
        <div>
          <strong>{domain.hostname}</strong> <span className="pill">{domain.status}</span>{' '}
          {domain.isPrimary ? <span className="pill">primary</span> : null}
        </div>
        <span className="muted small">
          {page ? `Page: ${page.name}` : 'No page assigned'}
          {domain.lastCheckedAt
            ? ` · checked ${new Date(domain.lastCheckedAt).toLocaleString()}`
            : ''}
        </span>
        {domain.status !== 'active' ? (
          <div className="panel inset-panel">
            <strong>DNS TXT verification</strong>
            <span className="muted small">Type: TXT</span>
            <code>{domain.verificationHostname}</code>
            <code>
              {domain.verificationToken ??
                'Verification token unavailable; reload and try again.'}
            </code>
            <span className="muted small">
              Add this record, wait for DNS propagation, then retry verification.
            </span>
          </div>
        ) : null}
        {domain.failureReason ? (
          <span className="alert alert-error">{domain.failureReason}</span>
        ) : null}
        <span className="muted small">
          {domain.landingPageId && domain.isPrimary
            ? 'Canonical primary domain'
            : 'Use Edit settings to assign a page or change the primary domain.'}
        </span>
      </div>
      <div className="row-actions">
        <button
          className="button button-small"
          disabled={busy}
          onClick={() => {
            setEditForm({
              landingPageId: domain.landingPageId ?? '',
              isPrimary: domain.isPrimary,
            });
            setEditOpen(true);
          }}
          type="button"
        >
          Edit settings
        </button>
        {domain.status !== 'active' ? (
          <button
            className="button button-small"
            disabled={busy}
            onClick={() => onVerify(domain)}
            type="button"
          >
            Verify / retry
          </button>
        ) : null}
        <button
          className="button button-small button-ghost"
          disabled={busy}
          onClick={() => onRemove(domain)}
          type="button"
        >
          Remove
        </button>
      </div>
      <Modal
        description={domain.hostname}
        eyebrow="Domain settings"
        footer={
          <>
            <button
              className="button button-ghost"
              onClick={() => setEditOpen(false)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="button button-primary"
              onClick={() => {
                onUpdate(domain, {
                  landingPageId: editForm.landingPageId || null,
                  isPrimary: Boolean(editForm.landingPageId) && editForm.isPrimary,
                });
                setEditOpen(false);
              }}
              type="button"
            >
              Save settings
            </button>
          </>
        }
        onClose={() => setEditOpen(false)}
        open={editOpen}
        size="md"
        title="Edit domain settings"
      >
        <div className="stack">
          <label>
            Page <span className="muted">(optional)</span>
            <select
              aria-label="Page"
              value={editForm.landingPageId}
              onChange={(event) =>
                setEditForm({ ...editForm, landingPageId: event.target.value })
              }
            >
              <option value="">Unassigned</option>
              {pages.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-field">
            <input
              checked={editForm.isPrimary}
              disabled={!editForm.landingPageId}
              onChange={(event) =>
                setEditForm({ ...editForm, isPrimary: event.target.checked })
              }
              type="checkbox"
            />
            <span>Primary/canonical domain</span>
          </label>
        </div>
      </Modal>
    </div>
  );
}

function PanelTitle({ title, count }: { title: string; count?: number }) {
  return (
    <div className="panel-heading">
      <h2>{title}</h2>
      {count !== undefined ? <span className="pill">{count}</span> : null}
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span className="muted">{description}</span>
    </div>
  );
}
