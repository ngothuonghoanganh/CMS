'use client';

import {
  PageSeoSettingsSchema,
  PageListResponseSchema,
  SiteListResponseSchema,
  type Collection,
  type Page,
  type Site,
  type PageSeoSettings,
} from '@payload/contracts';
import { useEffect, useState, type FormEvent } from 'react';

import { useCmsShell } from '../cms-shell';
import { ApiClientError, api } from '../lib/api';
import { SeoView } from './seo-view';

export default function SeoPage({
  siteId,
  pageId,
}: {
  siteId?: string;
  pageId?: string;
}) {
  const { workspaceId, can } = useCmsShell();
  const [sites, setSites] = useState<Site[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState(siteId ?? '');
  const [selectedPageId, setSelectedPageId] = useState(pageId ?? '');
  const [settings, setSettings] = useState<PageSeoSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!can('site.read')) return;
    void api
      .get(`/workspaces/${workspaceId}/sites?limit=100&offset=0`)
      .then((response) => {
        const next = SiteListResponseSchema.parse(response).items;
        setSites(next);
        setSelectedSiteId(siteId ?? next[0]?.id ?? '');
      })
      .catch((caughtError: unknown) => setError(message(caughtError)));
  }, [can, siteId, workspaceId]);
  useEffect(() => {
    if (!selectedSiteId || !sites.length) return;
    const pageSites = sites;
    void Promise.all([
      Promise.all(pageSites.map((site) => api.get(`/sites/${site.id}/pages?limit=100`))),
      api.get(`/workspaces/${workspaceId}/sites/${selectedSiteId}/collections`),
    ])
      .then(([pageResponses, collectionResponse]) => {
        const nextPages = pageResponses.flatMap(
          (response) => PageListResponseSchema.parse(response).items,
        );
        setPages(nextPages);
        setCollections(collectionResponse as Collection[]);
        if (!selectedPageId && nextPages[0]) setSelectedPageId(nextPages[0].id);
      })
      .catch((caughtError: unknown) => setError(message(caughtError)));
  }, [selectedPageId, selectedSiteId, sites, workspaceId]);
  useEffect(() => {
    if (!selectedPageId) {
      setSettings(null);
      return;
    }
    void api
      .get(`/pages/${selectedPageId}/seo`)
      .then((response) => setSettings(PageSeoSettingsSchema.parse(response)))
      .catch((caughtError: unknown) => setError(message(caughtError)));
  }, [selectedPageId]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPageId) return;
    const data = new FormData(event.currentTarget);
    const text = (name: string) => {
      const value = data.get(name);
      return typeof value === 'string' && value.trim() ? value.trim() : null;
    };
    setBusy(true);
    setNotice(null);
    try {
      const card = data.get('twitterCard');
      const page = pages.find((item) => item.id === selectedPageId);
      const bindings = Object.fromEntries(
        ['title', 'description', 'ogTitle', 'ogDescription', 'ogImage'].flatMap(
          (target) => {
            const value = data.get(`binding.${target}`);
            return typeof value === 'string' && value.trim()
              ? [
                  [
                    target,
                    { source: { type: 'current-entry' as const, path: value.trim() } },
                  ],
                ]
              : [];
          },
        ),
      );
      const response = await api.patch(`/pages/${selectedPageId}/seo`, {
        title: text('title'),
        description: text('description'),
        canonicalUrl: text('canonicalUrl'),
        noIndex: data.get('noIndex') === 'on',
        noFollow: data.get('noFollow') === 'on',
        ogTitle: text('ogTitle'),
        ogDescription: text('ogDescription'),
        ogImage: text('ogImage'),
        twitterCard: card === 'summary_large_image' || card === 'summary' ? card : null,
        twitterTitle: text('twitterTitle'),
        twitterDescription: text('twitterDescription'),
        twitterImage: text('twitterImage'),
        favicon: text('favicon'),
        ...(page?.kind === 'dynamic' ? { bindings } : {}),
      });
      setSettings(PageSeoSettingsSchema.parse(response));
      setNotice('SEO settings saved.');
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
      {notice ? (
        <div className="alert alert-success" role="status">
          {notice}
        </div>
      ) : null}
      <SeoView
        busy={busy}
        collections={collections}
        onSave={(event) => void save(event)}
        onSelectPage={setSelectedPageId}
        pages={pages}
        selectedPageId={selectedPageId}
        settings={settings}
      />
    </>
  );
}
function message(error: unknown): string {
  return error instanceof ApiClientError ? error.message : 'Unable to load SEO settings.';
}
