'use client';

import {
  AssetListResponseSchema,
  PageListResponseSchema,
  SiteListResponseSchema,
  TemplateListResponseSchema,
  type Asset,
  type Page,
  type Site,
  type Template,
} from '@payload/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useCmsShell } from '../cms-shell';
import { cmsViewPath, pagesPath } from '../cms-routes';
import { api } from '../lib/api';
import { StatusBadge } from '../status-badge';
import { EmptyState, PageHeader } from '../ui/surfaces';

export default function OverviewPage() {
  const { workspaceId, can } = useCmsShell();
  const [sites, setSites] = useState<Site[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const requests: Promise<unknown>[] = [];
    if (can('site.read')) {
      requests.push(
        api.get(`/workspaces/${workspaceId}/sites?limit=20&offset=0`).then((response) => {
          if (active) setSites(SiteListResponseSchema.parse(response).items);
        }),
      );
    }
    if (can('asset.read')) {
      requests.push(
        api.get(`/workspaces/${workspaceId}/assets?limit=100`).then((response) => {
          if (active) setAssets(AssetListResponseSchema.parse(response).items);
        }),
      );
    }
    if (can('template.read')) {
      requests.push(
        api.get(`/workspaces/${workspaceId}/templates?limit=100`).then((response) => {
          if (active) setTemplates(TemplateListResponseSchema.parse(response).items);
        }),
      );
    }
    if (can('page.read')) {
      requests.push(
        api
          .get(`/workspaces/${workspaceId}/sites?limit=20&offset=0`)
          .then(async (response) => {
            const siteList = SiteListResponseSchema.parse(response).items;
            const firstSite = siteList[0];
            if (!firstSite) return;
            const pageResponse = await api.get(`/sites/${firstSite.id}/pages?limit=100`);
            if (active) setPages(PageListResponseSchema.parse(pageResponse).items);
          }),
      );
    }
    void Promise.allSettled(requests).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [can, workspaceId]);

  const metrics = [
    { count: sites.length, href: cmsViewPath(workspaceId, 'sites'), label: 'Sites' },
    { count: pages.length, href: pagesPath(workspaceId, sites[0]?.id), label: 'Pages' },
    { count: assets.length, href: cmsViewPath(workspaceId, 'assets'), label: 'Assets' },
    {
      count: templates.length,
      href: cmsViewPath(workspaceId, 'templates'),
      label: 'Templates',
    },
  ];

  return (
    <>
      <PageHeader
        description="A focused workspace for managing your page inventory."
        eyebrow="Overview"
        title="Good morning"
      />
      {loading ? (
        <div aria-busy="true" className="analytics-skeleton">
          Loading workspace overview…
        </div>
      ) : null}
      <div className="metric-grid">
        {metrics.map((metric) => (
          <Link className="metric-card" href={metric.href} key={metric.label}>
            <span className="muted">{metric.label}</span>
            <strong>{metric.count}</strong>
            <span className="linkish">Manage →</span>
          </Link>
        ))}
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>Sites at a glance</h2>
          <Link className="text-link" href={cmsViewPath(workspaceId, 'sites')}>
            View all
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
