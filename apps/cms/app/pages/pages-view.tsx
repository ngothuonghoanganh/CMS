'use client';

import {
  type FormIntegrationBinding,
  type FormNode,
  type Integration,
  type Page,
  type PageVersion,
  type Collection,
  type CollectionEntryResponse,
  type Site,
  type Template,
} from '@payload/contracts';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';

import { StatusBadge } from '../status-badge';
import { Drawer, Modal, PageHeader, ResourceToolbar } from '../ui/surfaces';
import { PageLayoutEditor } from './page-layout-editor';

export type PageForm = {
  name: string;
  description: string;
  path: string;
  kind: Page['kind'];
  collectionId: string;
  pathPattern: string;
  lookupField: string;
  previewEntryId: string;
};

type PageTreeItem = {
  page: Page;
  children: PageTreeItem[];
};

type PageNodeWithChildren = {
  id: string;
  type: string;
  children: PageNodeWithChildren[];
};

export type PagesViewProps = {
  sites: Site[];
  pages: Page[];
  selectedSiteId: string;
  selectedPage: Page | undefined;
  selectedSite: Site | undefined;
  versions: PageVersion[];
  bindings: FormIntegrationBinding[];
  bindingSaving: boolean;
  integrations: Integration[];
  templates: Template[];
  collections: Collection[];
  collectionEntries: CollectionEntryResponse[];
  pageForm: PageForm;
  pageDrawerOpen: boolean;
  busy: boolean;
  canCreatePage: boolean;
  canUpdatePage: boolean;
  canPublishPage: boolean;
  canDeletePage: boolean;
  canReadWorkflows: boolean;
  onSaveFormBinding: (formNodeId: string, integrationIds: string[]) => void;
  onCreatePage: () => void;
  onOpenBuilder: (page: Page) => void;
  onEditPage: (page: Page) => void;
  onOpenWorkflows: (page: Page) => void;
  onOpenSeo: (page: Page) => void;
  onPreview: (page: Page) => void;
  onPublish: (page: Page) => void;
  onSelectSite: (siteId: string) => void;
  onSelectPage: (page: Page) => void;
  onUnpublish: (page: Page) => void;
  onDuplicate: (page: Page) => void;
  onDelete: (page: Page) => void;
  onSetHomepage: (page: Page) => void;
  onPageFormChange: (form: PageForm) => void;
  onPageSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClosePageDrawer: () => void;
  onChooseTemplate: (template: Template) => void;
};

export function publicationStatus(
  page: Page,
): 'Published' | 'Newer draft' | 'Unpublished' {
  if (!page.publishedVersionId) return 'Unpublished';
  return page.publishedVersionId === page.currentDraftVersionId
    ? 'Published'
    : 'Newer draft';
}

function pagePublicPath(page: Page, site: Site | undefined): string {
  if (site?.homePageId === page.id) return '/';
  return page.path ?? page.pathPattern ?? page.dynamicBasePath ?? '/';
}

function dynamicEntryPath(
  page: Page,
  entry: CollectionEntryResponse | undefined,
): string | undefined {
  if (page.kind !== 'dynamic' || !page.pathPattern || !page.lookupField || !entry) {
    return undefined;
  }
  const parameter = page.pathPattern.match(/\{([a-z][a-z0-9_]*)\}$/)?.[1];
  const rawValue = entry.values[page.lookupField];
  if (!parameter || (typeof rawValue !== 'string' && typeof rawValue !== 'number')) {
    return undefined;
  }
  const value = String(rawValue).trim();
  return value
    ? page.pathPattern.replace(`{${parameter}}`, encodeURIComponent(value))
    : undefined;
}

function publishedDynamicEntry(
  entries: CollectionEntryResponse[],
  preferredEntryId?: string,
): CollectionEntryResponse | undefined {
  const preferred = preferredEntryId
    ? entries.find(
        (entry) => entry.id === preferredEntryId && Boolean(entry.publishedVersionId),
      )
    : undefined;
  return preferred ?? entries.find((entry) => Boolean(entry.publishedVersionId));
}

function pageUrl(
  page: Page,
  site: Site | undefined,
  entries: CollectionEntryResponse[] = [],
  preferredEntryId?: string,
): string {
  const dynamicEntry = publishedDynamicEntry(entries, preferredEntryId);
  const path = dynamicEntryPath(page, dynamicEntry) ?? pagePublicPath(page, site);
  const base = site?.officialUrl?.replace(/\/$/, '') ?? `/${site?.slug ?? 'site-slug'}`;
  return `${base}${path === '/' ? '' : path}`;
}

function entryTitle(entry: CollectionEntryResponse, collection: Collection): string {
  const value = collection.titleFieldKey
    ? entry.values[collection.titleFieldKey]
    : undefined;
  return value === undefined || value === null || String(value).trim() === ''
    ? entry.id.slice(0, 8)
    : String(value);
}

function findFormNodes(node: PageNodeWithChildren): Array<Pick<FormNode, 'id'>> {
  if (node.type === 'form') return [{ id: node.id }];
  return node.children.flatMap((child) => findFormNodes(child));
}

function PageEmptyState({
  action,
  description,
  title,
}: {
  action?: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span className="muted">{description}</span>
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}

function pageTree(pages: Page[], site: Site | undefined): PageTreeItem[] {
  const byId = new Map(
    pages.map((page) => [page.id, { page, children: [] as PageTreeItem[] }]),
  );
  const byPath = new Map(
    pages.map((page) => [pagePublicPath(page, site), byId.get(page.id)!]),
  );
  const roots: PageTreeItem[] = [];

  for (const item of byId.values()) {
    const explicitParent = item.page.parentId ? byId.get(item.page.parentId) : undefined;
    const segments = pagePublicPath(item.page, site).split('/').filter(Boolean);
    const parentPath = segments.length > 1 ? `/${segments.slice(0, -1).join('/')}` : '';
    const derivedParent = parentPath ? byPath.get(parentPath) : undefined;
    const parent =
      explicitParent && explicitParent !== item ? explicitParent : derivedParent;
    if (parent && parent !== item && !parent.page.parentId?.includes(item.page.id)) {
      parent.children.push(item);
    } else {
      roots.push(item);
    }
  }

  const sort = (items: PageTreeItem[]) => {
    items.sort((left, right) => {
      const leftHome = site?.homePageId === left.page.id;
      const rightHome = site?.homePageId === right.page.id;
      if (leftHome !== rightHome) return leftHome ? -1 : 1;
      return left.page.name.localeCompare(right.page.name);
    });
    items.forEach((item) => sort(item.children));
    return items;
  };
  return sort(roots);
}

function PageTree({
  items,
  selectedPageId,
  site,
  onSelect,
}: {
  items: PageTreeItem[];
  selectedPageId: string | undefined;
  site: Site | undefined;
  onSelect: (page: Page) => void;
}) {
  return (
    <div aria-label="Page hierarchy" className="page-tree" role="tree">
      {items.map((item) => (
        <PageTreeRow
          item={item}
          key={item.page.id}
          onSelect={onSelect}
          selectedPageId={selectedPageId}
          site={site}
        />
      ))}
    </div>
  );
}

function PageTreeRow({
  item,
  selectedPageId,
  site,
  onSelect,
}: {
  item: PageTreeItem;
  selectedPageId: string | undefined;
  site: Site | undefined;
  onSelect: (page: Page) => void;
}) {
  const isHome = site?.homePageId === item.page.id;
  return (
    <div className="page-tree-branch" role="none">
      <button
        aria-label={`Select page ${item.page.name} at ${pagePublicPath(item.page, site)}`}
        aria-selected={selectedPageId === item.page.id}
        className={`page-tree-row${selectedPageId === item.page.id ? ' is-selected' : ''}`}
        onClick={() => onSelect(item.page)}
        role="button"
        type="button"
      >
        <span aria-hidden="true" className="page-tree-icon">
          {isHome ? '⌂' : item.children.length ? '▤' : '▧'}
        </span>
        <span className="page-tree-copy">
          <strong
            aria-hidden="true"
            className="page-tree-name"
            data-page-name={item.page.name}
          />
          <span>{pagePublicPath(item.page, site)}</span>
        </span>
        <StatusBadge status={publicationStatus(item.page)} />
      </button>
      {item.children.length ? (
        <div className="page-tree-children" role="group">
          {item.children.map((child) => (
            <PageTreeRow
              item={child}
              key={child.page.id}
              onSelect={onSelect}
              selectedPageId={selectedPageId}
              site={site}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PageActions({
  page,
  site,
  busy,
  canDeletePage,
  onDuplicate,
  onDelete,
  onSetHomepage,
  onOpenSeo,
}: {
  page: Page;
  site: Site | undefined;
  busy: boolean;
  canDeletePage: boolean;
  onDuplicate: (page: Page) => void;
  onDelete: (page: Page) => void;
  onSetHomepage: (page: Page) => void;
  onOpenSeo: (page: Page) => void;
}) {
  const isHome = site?.homePageId === page.id;
  return (
    <details className="page-actions-menu">
      <summary aria-label={`More actions for ${page.name}`}>⋯</summary>
      <div className="page-actions-menu-list">
        <button onClick={() => onOpenSeo(page)} type="button">
          SEO settings
        </button>
        {!isHome ? (
          <button disabled={busy} onClick={() => onSetHomepage(page)} type="button">
            Set as homepage
          </button>
        ) : null}
        <button onClick={() => onDuplicate(page)} type="button">
          Duplicate
        </button>
        {canDeletePage ? (
          <button disabled={isHome || busy} onClick={() => onDelete(page)} type="button">
            Delete
          </button>
        ) : null}
      </div>
    </details>
  );
}

function CreationSource({
  templates,
  pages,
  onBlank,
  onTemplate,
  onDuplicate,
}: {
  templates: Template[];
  pages: Page[];
  onBlank: () => void;
  onTemplate: (template: Template) => void;
  onDuplicate: (page: Page) => void;
}) {
  return (
    <div className="page-create-source">
      <p className="muted">Start with a structure that fits your next page.</p>
      <div className="page-create-options">
        <button className="page-create-option" onClick={onBlank} type="button">
          <strong>Blank page</strong>
          <span>Start with a clean canvas.</span>
        </button>
        {templates.length ? (
          templates.map((template) => (
            <button
              className="page-create-option"
              key={template.id}
              onClick={() => onTemplate(template)}
              type="button"
            >
              <strong>Template · {template.name}</strong>
              <span>{template.description || 'Use this saved page structure.'}</span>
            </button>
          ))
        ) : (
          <div className="page-create-option is-disabled" aria-disabled="true">
            <strong>Template</strong>
            <span>Save a template to reuse it here.</span>
          </div>
        )}
        {pages.length ? (
          <details className="page-create-duplicate">
            <summary>Duplicate an existing page</summary>
            <div className="page-create-duplicate-list">
              {pages.map((page) => (
                <button key={page.id} onClick={() => onDuplicate(page)} type="button">
                  {page.name} <span>{page.path}</span>
                </button>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}

export function PagesView({
  sites,
  pages,
  selectedSiteId,
  selectedPage,
  selectedSite,
  versions,
  bindings,
  bindingSaving,
  integrations,
  templates,
  collections,
  collectionEntries,
  pageForm,
  pageDrawerOpen,
  busy,
  canCreatePage,
  canUpdatePage,
  canPublishPage,
  canDeletePage,
  canReadWorkflows,
  onSaveFormBinding,
  onCreatePage,
  onOpenBuilder,
  onEditPage,
  onOpenWorkflows,
  onOpenSeo,
  onPreview,
  onPublish,
  onSelectSite,
  onSelectPage,
  onUnpublish,
  onDuplicate,
  onDelete,
  onSetHomepage,
  onPageFormChange,
  onPageSubmit,
  onClosePageDrawer,
  onChooseTemplate,
}: PagesViewProps) {
  const [pageSearch, setPageSearch] = useState('');
  const [pageStatus, setPageStatus] = useState('');
  const [creationStep, setCreationStep] = useState<'source' | 'details'>('details');
  const [deleteCandidate, setDeleteCandidate] = useState<Page | null>(null);
  const visiblePages = useMemo(() => {
    const query = pageSearch.trim().toLowerCase();
    return pages.filter((page) => {
      const matchesSearch =
        !query ||
        page.name.toLowerCase().includes(query) ||
        pagePublicPath(page, selectedSite).toLowerCase().includes(query) ||
        (page.slug ?? '').toLowerCase().includes(query);
      return matchesSearch && (!pageStatus || publicationStatus(page) === pageStatus);
    });
  }, [pageSearch, pageStatus, pages]);
  const tree = useMemo(
    () => pageTree(visiblePages, selectedSite),
    [selectedSite, visiblePages],
  );
  const routeConflicts = useMemo(() => {
    const counts = new Map<string, number>();
    pages.forEach((page) => {
      if (page.path) counts.set(page.path, (counts.get(page.path) ?? 0) + 1);
    });
    return new Set([...counts].filter(([, count]) => count > 1).map(([path]) => path));
  }, [pages]);
  const draftVersion = selectedPage
    ? versions.find((version) => version.id === selectedPage.currentDraftVersionId)
    : undefined;
  const formNodes =
    draftVersion && 'children' in draftVersion.payload.root
      ? findFormNodes(draftVersion.payload.root as unknown as PageNodeWithChildren)
      : [];
  const isCreating = !selectedPage;
  const dynamicCollection = collections.find(
    (collection) => collection.id === pageForm.collectionId,
  );
  const selectedDynamicEntry =
    selectedPage?.kind === 'dynamic'
      ? publishedDynamicEntry(collectionEntries, pageForm.previewEntryId)
      : undefined;
  const selectedDynamicPath =
    selectedPage?.kind === 'dynamic'
      ? dynamicEntryPath(selectedPage, selectedDynamicEntry)
      : undefined;

  function openCreateFlow() {
    setCreationStep('source');
    onCreatePage();
  }

  function chooseBlank() {
    setCreationStep('details');
  }

  function chooseTemplate(template: Template) {
    setCreationStep('details');
    onChooseTemplate(template);
  }

  return (
    <>
      <PageHeader
        actions={
          <button
            className="button button-primary"
            disabled={!selectedSiteId || !canCreatePage}
            onClick={openCreateFlow}
            type="button"
          >
            + New page
          </button>
        }
        eyebrow="Website structure"
        title="Pages"
        description="Organize your sitemap, edit pages visually, and keep every public route clear."
      />
      <ResourceToolbar>
        <label className="inline-field">
          Site
          <select
            aria-label="Site"
            onChange={(event) => onSelectSite(event.target.value)}
            value={selectedSiteId}
          >
            <option value="">Select a site</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-field page-search-field">
          Search
          <input
            aria-label="Search pages"
            onChange={(event) => setPageSearch(event.target.value)}
            placeholder="Search pages or paths"
            value={pageSearch}
          />
        </label>
        <label className="inline-field">
          Status
          <select
            aria-label="Filter pages by status"
            onChange={(event) => setPageStatus(event.target.value)}
            value={pageStatus}
          >
            <option value="">All statuses</option>
            <option value="Published">Published</option>
            <option value="Newer draft">Draft pending</option>
            <option value="Unpublished">Unpublished</option>
          </select>
        </label>
      </ResourceToolbar>

      {!selectedSite ? (
        <section className="panel">
          <PageEmptyState
            title="Select a site first"
            description="Pages belong to a site."
          />
        </section>
      ) : (
        <div className="pages-manager-layout">
          <section className="panel page-tree-panel">
            <div className="page-tree-heading">
              <div>
                <span className="eyebrow">Sitemap</span>
                <h2>{selectedSite.name}</h2>
              </div>
              <span className="pill">{visiblePages.length} pages</span>
            </div>
            {tree.length ? (
              <PageTree
                items={tree}
                onSelect={onSelectPage}
                selectedPageId={selectedPage?.id}
                site={selectedSite}
              />
            ) : (
              <PageEmptyState
                title={pages.length ? 'No matching pages' : 'Your sitemap is empty'}
                description={
                  pages.length
                    ? 'Try a different search or status filter.'
                    : 'Create a page to start shaping your website.'
                }
                action={
                  canCreatePage ? (
                    <button
                      className="button button-primary"
                      onClick={openCreateFlow}
                      type="button"
                    >
                      Create first page
                    </button>
                  ) : undefined
                }
              />
            )}
          </section>

          <section className="panel page-detail-panel" aria-label="Selected page details">
            {selectedPage ? (
              <>
                <div className="page-detail-heading">
                  <div>
                    <span className="eyebrow">
                      {selectedSite.homePageId === selectedPage.id ? 'Homepage' : 'Page'}
                    </span>
                    <h2>{selectedPage.name}</h2>
                    <code>{pagePublicPath(selectedPage, selectedSite)}</code>
                  </div>
                  <PageActions
                    busy={busy}
                    canDeletePage={canDeletePage}
                    onDelete={setDeleteCandidate}
                    onDuplicate={onDuplicate}
                    onOpenSeo={onOpenSeo}
                    onSetHomepage={onSetHomepage}
                    page={selectedPage}
                    site={selectedSite}
                  />
                </div>
                <div className="page-detail-status-row">
                  <StatusBadge status={publicationStatus(selectedPage)} />
                  {selectedPage.path && routeConflicts.has(selectedPage.path) ? (
                    <span className="page-warning" role="status">
                      Route conflict
                    </span>
                  ) : null}
                  <span className="muted small">
                    Updated {new Date(selectedPage.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="helper-text">
                  Public URL:{' '}
                  {selectedPage.kind === 'dynamic' && !selectedDynamicPath ? (
                    <code>{pageUrl(selectedPage, selectedSite, collectionEntries)}</code>
                  ) : (
                    <a
                      href={pageUrl(
                        selectedPage,
                        selectedSite,
                        collectionEntries,
                        pageForm.previewEntryId,
                      )}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {pageUrl(
                        selectedPage,
                        selectedSite,
                        collectionEntries,
                        pageForm.previewEntryId,
                      )}
                    </a>
                  )}
                </p>
                {selectedPage.kind === 'dynamic' ? (
                  <p className="helper-text">
                    {selectedDynamicPath
                      ? 'This link resolves the selected published entry. Choose a preview entry below to switch the detail URL.'
                      : 'Publish at least one collection entry to open a live detail URL.'}
                  </p>
                ) : null}
                {selectedPage.description ? <p>{selectedPage.description}</p> : null}
                <div
                  aria-hidden={pageDrawerOpen || undefined}
                  className="page-detail-actions"
                >
                  <button
                    className="button button-primary"
                    onClick={() => onOpenBuilder(selectedPage)}
                    type="button"
                  >
                    Open Builder
                  </button>
                  <button
                    className="button button-secondary"
                    onClick={() => onPreview(selectedPage)}
                    type="button"
                  >
                    Preview
                  </button>
                  {canPublishPage ? (
                    <button
                      className="button button-secondary"
                      disabled={busy}
                      onClick={() =>
                        publicationStatus(selectedPage) === 'Published'
                          ? onUnpublish(selectedPage)
                          : onPublish(selectedPage)
                      }
                      type="button"
                    >
                      {publicationStatus(selectedPage) === 'Published'
                        ? 'Unpublish'
                        : 'Publish draft'}
                    </button>
                  ) : null}
                  <button
                    className="button button-ghost"
                    onClick={() => onEditPage(selectedPage)}
                    type="button"
                  >
                    Settings
                  </button>
                </div>
                <div className="page-detail-summary-grid">
                  <div>
                    <span className="muted small">Draft</span>
                    <strong>v{draftVersion?.versionNumber ?? '—'}</strong>
                  </div>
                  <div>
                    <span className="muted small">Published</span>
                    <strong>
                      {selectedPage.publishedVersionId ? 'Live' : 'Not published'}
                    </strong>
                  </div>
                  <div>
                    <span className="muted small">Homepage</span>
                    <strong>
                      {selectedSite.homePageId === selectedPage.id ? 'Yes' : 'No'}
                    </strong>
                  </div>
                </div>
                {canReadWorkflows ? (
                  <button
                    aria-hidden={pageDrawerOpen || undefined}
                    className="text-link page-workflow-link"
                    onClick={() => onOpenWorkflows(selectedPage)}
                    type="button"
                  >
                    Manage workflows →
                  </button>
                ) : null}
              </>
            ) : (
              <PageEmptyState
                title="Select a page"
                description="Choose a page in the sitemap to inspect it."
              />
            )}
          </section>
        </div>
      )}

      {selectedPage ? (
        <section className="panel page-secondary-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Immutable snapshots</span>
              <h2>Version history</h2>
            </div>
            <span className="muted small">
              Current draft v{draftVersion?.versionNumber ?? '—'}
            </span>
          </div>
          {versions.length ? (
            <div className="page-version-list">
              {versions.map((version) => (
                <div className="list-row" key={version.id}>
                  <div>
                    <strong>Version {version.versionNumber}</strong>
                    <span className="muted">
                      {new Date(version.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <span className="muted">Snapshot</span>
                </div>
              ))}
            </div>
          ) : (
            <PageEmptyState
              title="No versions found"
              description="The page has no readable draft history."
            />
          )}
        </section>
      ) : null}

      {selectedPage ? (
        <PageLayoutEditor canUpdate={canUpdatePage} page={selectedPage} />
      ) : null}

      {selectedPage ? (
        <section
          className="panel page-secondary-panel"
          aria-label="Form integration settings"
        >
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Notifications</span>
              <h2>Form integrations</h2>
            </div>
            {bindingSaving ? <span className="muted small">Saving…</span> : null}
          </div>
          {formNodes.length ? (
            <div className="stack">
              {formNodes.map((formNode) => {
                const selectedIds =
                  bindings.find((binding) => binding.formNodeId === formNode.id)
                    ?.integrationIds ?? [];
                return (
                  <div className="form-integration-card" key={formNode.id}>
                    <strong>Form {formNode.id}</strong>
                    {integrations.length ? (
                      <div className="stack compact-stack">
                        {integrations.map((integration) => (
                          <label className="checkbox-field" key={integration.id}>
                            <input
                              checked={selectedIds.includes(integration.id)}
                              disabled={bindingSaving}
                              onChange={(event) => {
                                const nextIds = event.target.checked
                                  ? [...selectedIds, integration.id]
                                  : selectedIds.filter((id) => id !== integration.id);
                                onSaveFormBinding(formNode.id, nextIds);
                              }}
                              type="checkbox"
                            />
                            <span>
                              {integration.name}{' '}
                              <span className="muted small">
                                ({integration.type} ·{' '}
                                {integration.enabled ? 'enabled' : 'disabled'})
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <span className="muted small">
                        Create an integration from Integrations first.
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <PageEmptyState
              title="No form in the current draft"
              description="Add a Form block in the visual builder to configure notifications."
            />
          )}
        </section>
      ) : null}

      <Modal
        description={
          deleteCandidate
            ? `Deleting ${deleteCandidate.name} removes its draft history and public route.`
            : undefined
        }
        eyebrow="Destructive action"
        footer={
          <div className="form-actions">
            <button
              className="button button-ghost"
              onClick={() => setDeleteCandidate(null)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="button button-danger"
              disabled={busy || !deleteCandidate}
              onClick={() => {
                if (!deleteCandidate) return;
                onDelete(deleteCandidate);
                setDeleteCandidate(null);
              }}
              type="button"
            >
              Delete page
            </button>
          </div>
        }
        onClose={() => setDeleteCandidate(null)}
        open={Boolean(deleteCandidate)}
        size="sm"
        title="Delete this page?"
      >
        <p>
          This action cannot be undone. Choose another homepage first if this page is the
          site homepage.
        </p>
      </Modal>

      <Drawer
        allowBackgroundInteraction
        description={
          isCreating
            ? 'Choose a starting point, then set the page title and public path.'
            : 'Update metadata without leaving your sitemap.'
        }
        eyebrow={isCreating ? 'New page' : 'Page settings'}
        footer={
          <div className="form-actions">
            {selectedPage ? (
              <>
                {canPublishPage ? (
                  <button
                    className="button button-secondary"
                    onClick={() =>
                      publicationStatus(selectedPage) === 'Published'
                        ? onUnpublish(selectedPage)
                        : onPublish(selectedPage)
                    }
                    type="button"
                  >
                    {publicationStatus(selectedPage) === 'Published'
                      ? 'Unpublish'
                      : 'Publish draft'}
                  </button>
                ) : null}
                {canReadWorkflows ? (
                  <button
                    className="button button-ghost"
                    onClick={() => onOpenWorkflows(selectedPage)}
                    type="button"
                  >
                    Manage workflows
                  </button>
                ) : null}
                <button
                  className="button button-secondary"
                  onClick={() => onOpenBuilder(selectedPage)}
                  type="button"
                >
                  Open builder
                </button>
                <button
                  className="button button-ghost"
                  onClick={() => onPreview(selectedPage)}
                  type="button"
                >
                  Preview
                </button>
              </>
            ) : null}
            <button
              className="button button-primary"
              disabled={busy || (isCreating ? !canCreatePage : !canUpdatePage)}
              form="page-metadata-form"
              type="submit"
            >
              {busy ? 'Saving…' : isCreating ? 'Create page' : 'Save metadata'}
            </button>
            <button
              className="button button-ghost"
              onClick={onClosePageDrawer}
              type="button"
            >
              Cancel
            </button>
          </div>
        }
        onClose={onClosePageDrawer}
        open={pageDrawerOpen}
        size="md"
        title={isCreating ? 'Create page' : selectedPage.name}
      >
        {isCreating && creationStep === 'source' ? (
          <CreationSource
            onBlank={chooseBlank}
            onDuplicate={onDuplicate}
            onTemplate={chooseTemplate}
            pages={pages}
            templates={templates}
          />
        ) : selectedSite ? (
          <form className="stack" id="page-metadata-form" onSubmit={onPageSubmit}>
            <label>
              Page title
              <input
                aria-label="Page name"
                onChange={(event) =>
                  onPageFormChange({ ...pageForm, name: event.target.value })
                }
                required
                value={pageForm.name}
              />
            </label>
            <label>
              Page type
              <select
                aria-label="Page type"
                onChange={(event) =>
                  onPageFormChange({
                    ...pageForm,
                    kind: event.target.value as PageForm['kind'],
                  })
                }
                value={pageForm.kind}
              >
                <option value="standard">Standard page</option>
                <option value="dynamic">Dynamic collection page</option>
              </select>
            </label>
            {pageForm.kind === 'dynamic' ? (
              <>
                <div className="page-form-callout">
                  <strong>One page, many entries</strong>
                  <span className="muted small">
                    The route base is derived from the pattern and resolved against
                    published collection data.
                  </span>
                </div>
                <label>
                  Collection
                  <select
                    aria-label="Dynamic collection"
                    onChange={(event) =>
                      onPageFormChange({
                        ...pageForm,
                        collectionId: event.target.value,
                        lookupField: '',
                        previewEntryId: '',
                      })
                    }
                    required
                    value={pageForm.collectionId}
                  >
                    <option value="">Choose a collection</option>
                    {collections.map((collection) => (
                      <option key={collection.id} value={collection.id}>
                        {collection.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Path pattern
                  <span className="muted">Example: /products/{'{slug}'}</span>
                  <input
                    aria-label="Path pattern"
                    onChange={(event) =>
                      onPageFormChange({ ...pageForm, pathPattern: event.target.value })
                    }
                    placeholder="/products/{slug}"
                    required
                    value={pageForm.pathPattern}
                  />
                </label>
                <label>
                  Lookup field
                  <select
                    aria-label="Dynamic lookup field"
                    onChange={(event) =>
                      onPageFormChange({ ...pageForm, lookupField: event.target.value })
                    }
                    required
                    value={pageForm.lookupField}
                  >
                    <option value="">Choose a field</option>
                    {(dynamicCollection?.fields ?? [])
                      .filter((field) => field.status === 'active')
                      .map((field) => (
                        <option key={field.id} value={field.key}>
                          {field.label} · {field.key}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Preview entry
                  <select
                    aria-label="Preview entry"
                    onChange={(event) =>
                      onPageFormChange({
                        ...pageForm,
                        previewEntryId: event.target.value,
                      })
                    }
                    value={pageForm.previewEntryId}
                  >
                    <option value="">Choose an entry when previewing</option>
                    {collectionEntries.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entryTitle(entry, dynamicCollection ?? ({} as Collection))}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="helper-text">
                  Canonical route base:{' '}
                  <code>{pageForm.pathPattern.split('/{')[0] || '/products'}</code>
                </p>
                {selectedPage && selectedDynamicPath ? (
                  <p className="helper-text">
                    Live detail URL:{' '}
                    <a
                      href={pageUrl(
                        selectedPage,
                        selectedSite,
                        collectionEntries,
                        pageForm.previewEntryId,
                      )}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {pageUrl(
                        selectedPage,
                        selectedSite,
                        collectionEntries,
                        pageForm.previewEntryId,
                      )}
                    </a>
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <label>
                  URL path
                  <span className="muted">Use lowercase URL-safe segments.</span>
                  <input
                    aria-label="Slug"
                    onChange={(event) =>
                      onPageFormChange({
                        ...pageForm,
                        path: event.target.value.startsWith('/')
                          ? event.target.value
                          : `/${event.target.value}`,
                      })
                    }
                    placeholder="/about"
                    required
                    value={pageForm.path}
                  />
                </label>
                <p className="helper-text">
                  Canonical URL preview:{' '}
                  <code>
                    {pageForm.path === '/'
                      ? `/${selectedSite.slug}`
                      : `/${selectedSite.slug}${pageForm.path || '/page-path'}`}
                  </code>
                </p>
              </>
            )}
            <label>
              Description <span className="muted">Optional</span>
              <textarea
                aria-label="Description"
                maxLength={500}
                onChange={(event) =>
                  onPageFormChange({ ...pageForm, description: event.target.value })
                }
                rows={3}
                value={pageForm.description}
              />
            </label>
            {selectedPage ? (
              <div aria-label="Page status" className="page-form-status">
                <span className="muted">Status</span>
                <StatusBadge status={publicationStatus(selectedPage)} />
              </div>
            ) : null}
          </form>
        ) : (
          <PageEmptyState
            title="Select a site first"
            description="Pages belong to a site."
          />
        )}
      </Drawer>
    </>
  );
}
