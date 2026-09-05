'use client';

import {
  FormIntegrationBindingListResponseSchema,
  IntegrationListResponseSchema,
  PageListResponseSchema,
  PageVersionListResponseSchema,
  PublishReadinessSchema,
  SiteListResponseSchema,
  TemplateListResponseSchema,
  type Collection,
  type CollectionEntryResponse,
  type FormIntegrationBinding,
  type Integration,
  type Page,
  type PageVersion,
  type PublishReadiness,
  type Site,
  type Template,
} from '@payload/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { useCmsShell } from '../cms-shell';
import { pagePath, pagesPath } from '../cms-routes';
import { ApiClientError, api } from '../lib/api';
import { PagesView, type PageForm } from './pages-view';

const blankPage: PageForm = {
  name: '',
  description: '',
  path: '',
  kind: 'standard',
  collectionId: '',
  pathPattern: '',
  lookupField: '',
  previewEntryId: '',
};
const rendererBaseUrl =
  process.env.NEXT_PUBLIC_RENDERER_BASE_URL ?? 'http://127.0.0.1:3002';

function pageFormFromPage(page: Page): PageForm {
  return {
    name: page.name,
    description: page.description ?? '',
    path: page.path ?? '',
    kind: page.kind,
    collectionId: page.collectionId ?? '',
    pathPattern: page.pathPattern ?? '',
    lookupField: page.lookupField ?? '',
    previewEntryId: '',
  };
}
function defaultPayload(title: string) {
  return {
    metadata: { documentTitle: title },
    root: { children: [], id: 'root', props: {}, type: 'root' as const },
    version: 1 as const,
  };
}
function message(error: unknown): string {
  return error instanceof ApiClientError ? error.message : 'Unable to load pages.';
}

function withPreviewEntry(page: Page | undefined, path: string, previewEntryId: string) {
  return page?.kind === 'dynamic' && previewEntryId
    ? `${path}?previewEntryId=${encodeURIComponent(previewEntryId)}`
    : path;
}

export default function PagesPage({
  siteId,
  pageId,
  action,
  previewEntryId,
  templateId,
  templateVersionId,
}: {
  siteId?: string;
  pageId?: string;
  action?: 'create' | 'edit';
  previewEntryId?: string;
  templateId?: string;
  templateVersionId?: string;
}) {
  const router = useRouter();
  const { workspaceId, can } = useCmsShell();
  const [sites, setSites] = useState<Site[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [entries, setEntries] = useState<CollectionEntryResponse[]>([]);
  const [versions, setVersions] = useState<PageVersion[]>([]);
  const [versionOffset, setVersionOffset] = useState(0);
  const [versionPagination, setVersionPagination] = useState({
    limit: 20,
    offset: 0,
    total: 0,
    hasNextPage: false,
  });
  const [bindings, setBindings] = useState<FormIntegrationBinding[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState(siteId ?? '');
  const [pageForm, setPageForm] = useState<PageForm>(blankPage);
  const [busy, setBusy] = useState(false);
  const [bindingSaving, setBindingSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [publishCandidate, setPublishCandidate] = useState<Page | undefined>();
  const [publishVersionNumber, setPublishVersionNumber] = useState<number | undefined>();
  const [publishReadiness, setPublishReadiness] = useState<PublishReadiness | null>(null);
  const [publishLoading, setPublishLoading] = useState(false);
  const selectedPage = pages.find((page) => page.id === pageId);
  const selectedSite = sites.find((site) => site.id === selectedSiteId);

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
    const requests: Promise<unknown>[] = [
      api
        .get(`/sites/${selectedSiteId}/pages?limit=100`)
        .then((response) => setPages(PageListResponseSchema.parse(response).items)),
      api
        .get(`/workspaces/${workspaceId}/sites/${selectedSiteId}/collections`)
        .then((response) => setCollections(response as Collection[])),
    ];
    if (can('template.read'))
      requests.push(
        api
          .get(`/workspaces/${workspaceId}/templates?limit=100`)
          .then((response) =>
            setTemplates(TemplateListResponseSchema.parse(response).items),
          ),
      );
    if (can('integration.read'))
      requests.push(
        api
          .get(`/workspaces/${workspaceId}/integrations?limit=100`)
          .then((response) =>
            setIntegrations(IntegrationListResponseSchema.parse(response).items),
          ),
      );
    void Promise.all(requests).catch((caughtError: unknown) =>
      setError(message(caughtError)),
    );
  }, [can, selectedSiteId, workspaceId]);
  useEffect(() => {
    setPageForm(
      selectedPage
        ? {
            ...pageFormFromPage(selectedPage),
            ...(previewEntryId ? { previewEntryId } : {}),
          }
        : action === 'create'
          ? { ...blankPage, ...(previewEntryId ? { previewEntryId } : {}) }
          : blankPage,
    );
  }, [action, previewEntryId, selectedPage]);
  useEffect(() => {
    if (!pageId) {
      setVersions([]);
      setVersionOffset(0);
      setVersionPagination({ limit: 20, offset: 0, total: 0, hasNextPage: false });
      setBindings([]);
      setEntries([]);
      return;
    }
    void Promise.all([
      api.get(`/pages/${pageId}/versions?limit=20&offset=${versionOffset}`),
      api.get(`/pages/${pageId}/form-integrations`),
    ])
      .then(([versionsResponse, bindingsResponse]) => {
        const parsedVersions = PageVersionListResponseSchema.parse(versionsResponse);
        setVersions(parsedVersions.items);
        setVersionPagination(parsedVersions.pagination);
        setBindings(
          FormIntegrationBindingListResponseSchema.parse(bindingsResponse).items,
        );
      })
      .catch((caughtError: unknown) => setError(message(caughtError)));
  }, [pageId, versionOffset]);
  useEffect(() => {
    if (!selectedSiteId || !selectedPage?.collectionId) {
      setEntries([]);
      return;
    }
    void api
      .get(
        `/workspaces/${workspaceId}/sites/${selectedSiteId}/collections/${selectedPage.collectionId}/entries?limit=100&offset=0`,
      )
      .then((response) =>
        setEntries((response as { items: CollectionEntryResponse[] }).items),
      )
      .catch(() => setEntries([]));
  }, [selectedPage?.collectionId, selectedSiteId, workspaceId]);
  useEffect(() => {
    if (selectedPage?.kind !== 'dynamic') return;
    setPageForm((current) => {
      if (current.previewEntryId) return current;
      const firstPublishedEntry = entries.find((entry) => entry.publishedVersionId);
      return firstPublishedEntry
        ? { ...current, previewEntryId: firstPublishedEntry.id }
        : current;
    });
  }, [entries, selectedPage?.kind]);

  async function run(runAction: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await runAction();
    } catch (caughtError) {
      setError(message(caughtError));
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSiteId) return;
    await run(async () => {
      const normalizedPath = pageForm.path
        .trim()
        .replace(/^\/+/, '')
        .toLowerCase()
        .replace(/[^a-z0-9\-_/]+/g, '-');
      const routeMetadata =
        pageForm.kind === 'dynamic'
          ? {
              kind: 'dynamic' as const,
              collectionId: pageForm.collectionId,
              pathPattern: pageForm.pathPattern,
              lookupField: pageForm.lookupField,
            }
          : {
              kind: 'standard' as const,
              ...(normalizedPath ? { path: `/${normalizedPath}` } : {}),
            };
      if (selectedPage) {
        const updated = await api.patch<Page>(`/pages/${selectedPage.id}`, {
          expectedVersionNumber: versions[0]?.versionNumber,
          name: pageForm.name,
          description: pageForm.description.trim() || null,
          ...routeMetadata,
        });
        setPages((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        );
        router.replace(pagePath(workspaceId, selectedSiteId, updated.id));
      } else {
        const created = templateId
          ? await api.post<Page>(
              `/workspaces/${workspaceId}/templates/${templateId}/apply`,
              {
                siteId: selectedSiteId,
                name: pageForm.name,
                ...(templateVersionId ? { templateVersionId } : {}),
                ...(pageForm.description.trim()
                  ? { description: pageForm.description.trim() }
                  : {}),
                ...routeMetadata,
              },
            )
          : await api.post<Page>(`/sites/${selectedSiteId}/pages`, {
              name: pageForm.name,
              ...(pageForm.description.trim()
                ? { description: pageForm.description.trim() }
                : {}),
              ...routeMetadata,
              payload: defaultPayload(pageForm.name),
            });
        router.replace(pagePath(workspaceId, selectedSiteId, created.id));
      }
    });
  }
  async function mutatePage(
    path: string,
    method: 'post' | 'delete',
    page: Page,
    successMessage?: string,
    body: Record<string, unknown> = {},
  ) {
    await run(async () => {
      const updated = method === 'post' ? await api.post<Page>(path, body) : null;
      if (method === 'delete') {
        await api.delete(path);
        setPages((current) => current.filter((item) => item.id !== page.id));
        router.replace(pagesPath(workspaceId, page.siteId));
      } else if (updated)
        setPages((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        );
      if (successMessage) setNotice(successMessage);
    });
  }

  async function openPublishDialog(page: Page, versionNumber?: number) {
    setPublishCandidate(page);
    setPublishVersionNumber(versionNumber);
    setPublishReadiness(null);
    setPublishLoading(true);
    setError(null);
    try {
      const query = versionNumber ? `?versionNumber=${versionNumber}` : '';
      const response = await api.get(`/pages/${page.id}/publish-readiness${query}`);
      setPublishReadiness(PublishReadinessSchema.parse(response));
    } catch (caughtError) {
      setError(message(caughtError));
      setPublishCandidate(undefined);
    } finally {
      setPublishLoading(false);
    }
  }

  function closePublishDialog() {
    setPublishCandidate(undefined);
    setPublishVersionNumber(undefined);
    setPublishReadiness(null);
  }

  function confirmPublish(page: Page, versionNumber?: number) {
    closePublishDialog();
    void mutatePage(
      `/pages/${page.id}/publish`,
      'post',
      page,
      'Page published.',
      versionNumber ? { versionNumber } : {},
    );
  }

  function restoreVersion(page: Page, version: PageVersion) {
    const expectedCurrentVersionNumber = versions[0]?.versionNumber;
    if (!expectedCurrentVersionNumber) return;
    void run(async () => {
      const restored = await api.post<PageVersion>(
        `/pages/${page.id}/versions/${version.versionNumber}/restore`,
        { expectedCurrentVersionNumber },
      );
      setVersions((current) => [restored, ...current]);
      setPages((current) =>
        current.map((item) =>
          item.id === page.id
            ? {
                ...item,
                currentDraftVersionId: restored.id,
                updatedAt: restored.createdAt,
              }
            : item,
        ),
      );
      setNotice(`Version ${version.versionNumber} restored as a new draft.`);
    });
  }

  async function saveBinding(formNodeId: string, integrationIds: string[]) {
    setBindingSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await api.patch(
        `/pages/${pageId}/form-integrations/${formNodeId}`,
        { integrationIds },
      );
      const saved =
        FormIntegrationBindingListResponseSchema.shape.items.element.parse(response);
      setBindings((current) => [
        ...current.filter((item) => item.formNodeId !== saved.formNodeId),
        saved,
      ]);
      setNotice('Form notifications updated.');
    } catch (caughtError) {
      setError(message(caughtError));
    } finally {
      setBindingSaving(false);
    }
  }
  function openBuilder(page: Page) {
    router.push(pagePath(workspaceId, page.siteId, page.id, 'builder'));
  }
  function openPreview(page: Page) {
    const query = new URLSearchParams();
    if (page.kind === 'dynamic' && pageForm.previewEntryId) {
      query.set('entryId', pageForm.previewEntryId);
    }
    const queryString = query.toString();
    window.open(
      `${rendererBaseUrl}/preview/${encodeURIComponent(page.id)}${
        queryString ? `?${queryString}` : ''
      }`,
      '_blank',
      'noopener,noreferrer',
    );
  }
  function openHistoricalPreview(page: Page, version: PageVersion) {
    const query = new URLSearchParams({ versionNumber: String(version.versionNumber) });
    if (page.kind === 'dynamic' && pageForm.previewEntryId) {
      query.set('entryId', pageForm.previewEntryId);
    }
    window.open(
      `${rendererBaseUrl}/preview/${encodeURIComponent(page.id)}?${query.toString()}`,
      '_blank',
      'noopener,noreferrer',
    );
  }
  const collectionEntries = useMemo(() => entries, [entries]);
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
      <PagesView
        bindings={bindings}
        bindingSaving={bindingSaving}
        busy={busy}
        canCreatePage={can('page.create')}
        canDeletePage={can('page.delete')}
        canPublishPage={can('page.publish')}
        canRollbackPage={can('page.rollback')}
        canReadWorkflows={can('workflow.read')}
        canUpdatePage={can('page.update')}
        collectionEntries={collectionEntries}
        collections={collections}
        integrations={integrations}
        onChooseTemplate={(template) =>
          router.replace(
            `${pagesPath(workspaceId, selectedSiteId)}/new?templateId=${encodeURIComponent(template.id)}`,
          )
        }
        onClosePageDrawer={() =>
          router.replace(
            selectedPage
              ? withPreviewEntry(
                  selectedPage,
                  pagePath(workspaceId, selectedSiteId, selectedPage.id),
                  pageForm.previewEntryId,
                )
              : pagesPath(workspaceId, selectedSiteId),
          )
        }
        onCreatePage={() => router.push(`${pagesPath(workspaceId, selectedSiteId)}/new`)}
        onDelete={(page) => void mutatePage(`/pages/${page.id}`, 'delete', page)}
        onDuplicate={(page) =>
          void run(async () => {
            const duplicated = await api.post<Page>(`/pages/${page.id}/duplicate`, {});
            setPages((current) => [duplicated, ...current]);
            router.push(pagePath(workspaceId, page.siteId, duplicated.id, 'edit'));
          })
        }
        onEditPage={(page) =>
          router.push(
            withPreviewEntry(
              page,
              pagePath(workspaceId, page.siteId, page.id, 'edit'),
              pageForm.previewEntryId,
            ),
          )
        }
        onOpenBuilder={openBuilder}
        onOpenSeo={(page) =>
          router.push(pagePath(workspaceId, page.siteId, page.id, 'seo'))
        }
        onOpenWorkflows={(page) =>
          router.push(pagePath(workspaceId, page.siteId, page.id, 'workflows'))
        }
        onPageFormChange={setPageForm}
        onPageSubmit={(event) => void save(event)}
        onPreview={openPreview}
        onPublish={confirmPublish}
        onOpenPublishDialog={openPublishDialog}
        onClosePublishDialog={closePublishDialog}
        onPreviewVersion={openHistoricalPreview}
        onRestoreVersion={restoreVersion}
        onVersionPage={setVersionOffset}
        onSaveFormBinding={(formNodeId, integrationIds) =>
          void saveBinding(formNodeId, integrationIds)
        }
        onSelectPage={(page) => router.push(pagePath(workspaceId, page.siteId, page.id))}
        onSelectSite={(nextSiteId) => {
          setSelectedSiteId(nextSiteId);
          router.push(pagesPath(workspaceId, nextSiteId));
        }}
        onSetHomepage={(page) =>
          void mutatePage(`/pages/${page.id}/homepage`, 'post', page, 'Homepage updated.')
        }
        onUnpublish={(page) =>
          void mutatePage(
            `/pages/${page.id}/unpublish`,
            'post',
            page,
            'Page unpublished.',
          )
        }
        pageDrawerOpen={Boolean(action)}
        pageForm={pageForm}
        pages={pages}
        publishCandidate={publishCandidate}
        publishLoading={publishLoading}
        publishReadiness={publishReadiness}
        publishVersionNumber={publishVersionNumber}
        selectedPage={selectedPage}
        selectedSite={selectedSite}
        selectedSiteId={selectedSiteId}
        sites={sites}
        templates={templates}
        versions={versions}
        versionPagination={versionPagination}
      />
    </>
  );
}
