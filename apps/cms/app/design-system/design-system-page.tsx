'use client';

import { SiteListResponseSchema, type Site } from '@payload/contracts';
import { useEffect, useState } from 'react';

import { useCmsShell } from '../cms-shell';
import { api } from '../lib/api';
import { DesignSystemView } from './design-system-view';

export default function DesignSystemPage({ siteId }: { siteId?: string }) {
  const { workspaceId, can } = useCmsShell();
  const [sites, setSites] = useState<Site[]>([]);
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
        inheritedSiteCount={sites.length}
        workspaceId={workspaceId}
      />
    );
  }
  return (
    <DesignSystemView
      canUpdate={can('design-system.update')}
      siteId={selectedSiteId!}
      workspaceId={workspaceId}
    />
  );
}
