'use client';

import type { CustomDomain, LandingPage } from '@payload/contracts';
import type { FormEvent } from 'react';

type DomainForm = { hostname: string; landingPageId: string; isPrimary: boolean };

export function DomainsView({
  domains,
  pages,
  form,
  busy,
  onChange,
  onSubmit,
  onVerify,
  onUpdate,
  onRemove,
}: {
  domains: CustomDomain[];
  pages: LandingPage[];
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
  return (
    <>
      <PageHeading
        eyebrow="Settings"
        title="Domains"
        description="Connect a verified hostname to a published landing page. TLS remains the responsibility of your edge or hosting provider."
      />
      <div className="two-column">
        <section className="panel">
          <PanelTitle title="Add a custom domain" />
          <form className="stack" onSubmit={onSubmit}>
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
              Landing page <span className="muted">(optional until verification)</span>
              <select
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
                onChange={(event) =>
                  onChange({ ...form, isPrimary: event.target.checked })
                }
                type="checkbox"
              />
              <span>Use as the canonical primary domain for this page</span>
            </label>
            <button className="button button-primary" disabled={busy} type="submit">
              {busy ? 'Adding…' : 'Add domain'}
            </button>
          </form>
        </section>
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
      </div>
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
  pages: LandingPage[];
  busy: boolean;
  onVerify: (domain: CustomDomain) => void;
  onUpdate: (
    domain: CustomDomain,
    input: { landingPageId: string | null; isPrimary: boolean },
  ) => void;
  onRemove: (domain: CustomDomain) => void;
}) {
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
        <label className="inline-field">
          Page
          <select
            value={domain.landingPageId ?? ''}
            onChange={(event) =>
              onUpdate(domain, {
                landingPageId: event.target.value || null,
                isPrimary: event.target.value ? domain.isPrimary : false,
              })
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
        {domain.landingPageId ? (
          <label className="checkbox-field">
            <input
              checked={domain.isPrimary}
              onChange={(event) =>
                onUpdate(domain, {
                  landingPageId: domain.landingPageId ?? null,
                  isPrimary: event.target.checked,
                })
              }
              type="checkbox"
            />
            <span>Primary/canonical domain</span>
          </label>
        ) : null}
      </div>
      <div className="row-actions">
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
    </div>
  );
}

function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-heading">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p className="muted">{description}</p>
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
