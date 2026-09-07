'use client';

import { SiteListResponseSchema, SiteSchema, type Site } from '@payload/contracts';
import { useEffect, useState } from 'react';

import { useCmsShell } from '../cms-shell';
import { api } from '../lib/api';
import { DesignSystemView } from './design-system-view';

export default function DesignSystemPage({ siteId }: { siteId?: string }) {
  const { workspaceId, can } = useCmsShell();
  const [sites, setSites] = useState<Site[]>([]);
  const [site, setSite] = useState<Site | null>(null);

  useEffect(() => {
    if (!siteId) {
      setSite(null);
      return;
    }
    let cancelled = false;
    void api
      .get(`/workspaces/${workspaceId}/sites/${siteId}`)
      .then((response) => {
        if (!cancelled) setSite(SiteSchema.parse(response));
      })
      .catch(() => {
        if (!cancelled) setSite(null);
      });
    return () => {
      cancelled = true;
    };
  }, [siteId, workspaceId]);

  useEffect(() => {
    if (siteId) return;
    void api
      .get(`/workspaces/${workspaceId}/sites?limit=100&offset=0`)
      .then((response) => setSites(SiteListResponseSchema.parse(response).items))
      .catch(() => setSites([]));
  }, [siteId, workspaceId]);
  const selectedSiteId = siteId ?? sites[0]?.id;
  if (!siteId) {
    return (
      <DesignSystemView
        canUpdate={can('design-system.update')}
        canPublish={false}
        inheritedSiteCount={sites.length}
        siteName="Your website"
        workspaceId={workspaceId}
      />
    );
  }
  return (
    <DesignSystemView
      canUpdate={can('design-system.update')}
      canPublish={can('site.publish')}
      siteId={selectedSiteId!}
      siteLogo={site?.logo}
      siteName={site?.name ?? 'Your website'}
      siteStatus={site?.status}
      workspaceId={workspaceId}
    />
  );
}
