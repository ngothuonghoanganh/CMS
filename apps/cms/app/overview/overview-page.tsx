'use client';

import {
  PageListResponseSchema,
  SiteListResponseSchema,
  type Page,
  type Site,
} from '@payload/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useCmsShell } from '../cms-shell';
import { cmsViewPath, pagesPath } from '../cms-routes';
import { api } from '../lib/api';
import { StatusBadge } from '../status-badge';
import { EmptyState, PageHeader } from '../ui/surfaces';
import { getOverviewStep } from './overview-flow';

export default function OverviewPage() {
  const { workspaceId, can } = useCmsShell();
  const [sites, setSites] = useState<Site[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadOverview() {
      try {
        setError(null);
        const siteResponse = can('site.read')
          ? SiteListResponseSchema.parse(
              await api.get(`/workspaces/${workspaceId}/sites?limit=20&offset=0`),
            )
          : undefined;
        const siteList = siteResponse?.items ?? [];
        if (active) setSites(siteList);

        const firstSite = siteList[0];
        if (can('page.read') && firstSite) {
          const pageResponse = await api.get(`/sites/${firstSite.id}/pages?limit=100`);
          if (active) setPages(PageListResponseSchema.parse(pageResponse).items);
        }
      } catch (caughtError) {
        if (active) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : 'Unable to load overview.',
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadOverview();
    return () => {
      active = false;
    };
  }, [can, workspaceId]);

  const nextStep = getOverviewStep({ pageCount: pages.length, siteCount: sites.length });
  const nextStepHref =
    nextStep.key === 'create-site'
      ? `${cmsViewPath(workspaceId, 'sites')}/new`
      : pagesPath(workspaceId, sites[0]?.id);

  return (
    <>
      <PageHeader
        actions={
          <div className="form-actions">
            {can('site.create') && !sites.length ? (
              <Link
                className="button button-primary"
                href={`${cmsViewPath(workspaceId, 'sites')}/new`}
              >
                Create website
              </Link>
            ) : null}
          </div>
        }
        description="Create a website, add a page, and make it live without code."
        eyebrow="Overview"
        title="Good morning"
      />
      <section className="overview-hero panel">
        <div>
          <span className="eyebrow">Next step</span>
          <h2>{nextStep.title}</h2>
          <p className="muted">{nextStep.description}</p>
          {can(nextStep.key === 'create-site' ? 'site.create' : 'page.read') ? (
            <Link
              className="button button-primary overview-next-action"
              href={nextStepHref}
            >
              {nextStep.actionLabel}
            </Link>
          ) : null}
        </div>
        <ol className="overview-steps" aria-label="Website setup progress">
          <li className={sites.length ? 'is-complete' : 'is-current'}>
            <span>1</span>
            <strong>Website</strong>
            <small>{sites.length ? 'Ready' : 'Start here'}</small>
          </li>
          <li className={pages.length ? 'is-complete' : sites.length ? 'is-current' : ''}>
            <span>2</span>
            <strong>Page</strong>
            <small>{pages.length ? 'Ready' : 'Add next'}</small>
          </li>
          <li className={pages.length ? 'is-current' : ''}>
            <span>3</span>
            <strong>Publish</strong>
            <small>Make it live</small>
          </li>
        </ol>
      </section>
      {error ? (
        <div className="alert alert-error" role="alert">
          <span>{error}</span>
          <button
            className="button button-small button-ghost"
            onClick={() => window.location.reload()}
            type="button"
          >
            Retry
          </button>
        </div>
      ) : null}
      {loading ? (
        <div aria-busy="true" className="analytics-skeleton">
          Loading workspace overview…
        </div>
      ) : null}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Your work</span>
            <h2>Websites</h2>
          </div>
          <Link className="text-link" href={cmsViewPath(workspaceId, 'sites')}>
            View websites
          </Link>
        </div>
        {sites.length ? (
          <div className="list">
            {sites.slice(0, 5).map((site) => (
              <Link
                className="list-row"
                href={`${cmsViewPath(workspaceId, 'sites')}/${site.id}`}
                key={site.id}
              >
                <span>
                  <strong>{site.name}</strong>
                  <span className="muted">/{site.slug}</span>
                </span>
                <StatusBadge status={site.status} />
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            description="Create your first site to start organizing pages."
            title="No sites found"
          />
        )}
      </section>
    </>
  );
}
