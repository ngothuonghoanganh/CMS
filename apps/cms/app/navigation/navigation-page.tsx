'use client';

import {
  NavigationListResponseSchema,
  PageListResponseSchema,
  SiteListResponseSchema,
  NavigationSchema,
  type Navigation,
  type NavigationItem,
  type Page,
  type Site,
} from '@payload/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useCmsShell } from '../cms-shell';
import { sitePath } from '../cms-routes';
import { ApiClientError, api } from '../lib/api';
import { NavigationView } from './navigation-view';

export default function NavigationPage({ siteId }: { siteId?: string }) {
  const router = useRouter();
  const { workspaceId, can } = useCmsShell();
  const [sites, setSites] = useState<Site[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [navigations, setNavigations] = useState<Navigation[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState(siteId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void api
      .get(`/workspaces/${workspaceId}/sites?limit=100&offset=0`)
      .then((response) => {
        const next = SiteListResponseSchema.parse(response).items;
        setSites(next);
        setSelectedSiteId(siteId ?? next[0]?.id ?? '');
      })
      .catch((caughtError: unknown) => setError(message(caughtError)));
  }, [siteId, workspaceId]);
  useEffect(() => {
    if (!selectedSiteId) return;
    void Promise.all([
      api.get(`/sites/${selectedSiteId}/pages?limit=100`),
      api.get(`/sites/${selectedSiteId}/navigations`),
    ])
      .then(([pagesResponse, navigationResponse]) => {
        setPages(PageListResponseSchema.parse(pagesResponse).items);
        setNavigations(NavigationListResponseSchema.parse(navigationResponse).items);
      })
      .catch((caughtError: unknown) => setError(message(caughtError)));
  }, [selectedSiteId]);
  async function save(input: {
    id?: string;
    key: string;
    name: string;
    items: NavigationItem[];
  }) {
    setBusy(true);
    try {
      const response = input.id
        ? await api.patch(`/sites/${selectedSiteId}/navigations/${input.id}`, {
            name: input.name,
            items: input.items,
          })
        : await api.post(`/sites/${selectedSiteId}/navigations`, input);
      const saved = NavigationSchema.parse(response);
      setNavigations((current) =>
        input.id
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [...current, saved],
      );
    } catch (caughtError) {
      setError(message(caughtError));
    } finally {
      setBusy(false);
    }
  }
  async function remove(navigation: Navigation) {
    if (!window.confirm(`Delete ${navigation.name}?`)) return;
    setBusy(true);
    try {
      await api.delete(`/sites/${selectedSiteId}/navigations/${navigation.id}`);
      setNavigations((current) => current.filter((item) => item.id !== navigation.id));
    } catch (caughtError) {
      setError(message(caughtError));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {error ? (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      ) : null}
      <NavigationView
        busy={busy}
        canUpdate={can('site.update')}
        navigations={navigations}
        onRemove={(navigation) => void remove(navigation)}
        onSave={(input) => void save(input)}
        onSelectSite={(nextSiteId) => {
          setSelectedSiteId(nextSiteId);
          router.push(`${sitePath(workspaceId, nextSiteId)}/navigation`);
        }}
        pages={pages}
        selectedSiteId={selectedSiteId}
        sites={sites}
      />
    </>
  );
}
function message(error: unknown): string {
  return error instanceof ApiClientError ? error.message : 'Unable to load navigation.';
}
