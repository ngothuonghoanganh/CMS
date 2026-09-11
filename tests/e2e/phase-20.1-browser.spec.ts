import { expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

import { loginToCanonicalBuilder, test } from './fixtures/canonical-environment';
import { E2E_API_BASE_URL, E2E_RENDERER_ORIGIN } from './fixtures/urls';

const apiBase = E2E_API_BASE_URL;
const rendererBase = E2E_RENDERER_ORIGIN;

type ProductScenario = {
  collectionKey: string;
  cleanup: () => Promise<void>;
};
let cleanupProductScenario: (() => Promise<void>) | undefined;

test.afterEach(async () => {
  await cleanupProductScenario?.();
  cleanupProductScenario = undefined;
});

async function seedCanonicalProductsScenario(
  page: import('@playwright/test').Page,
  environment: {
    workspaceId: string;
    pageId: string;
    pageSlug: string;
    siteId: string;
    siteSlug: string;
  },
): Promise<ProductScenario> {
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const collectionKey = `products-${suffix}`;
  const scope = `${apiBase}/workspaces/${environment.workspaceId}/sites/${environment.siteId}`;
  const queryId = randomUUID();
  const listHeadingId = `heading-${randomUUID()}`;
  const listButtonId = `button-${randomUUID()}`;
  const dynamicHeadingId = `heading-${randomUUID()}`;
  const collectionResponse = await page.request.post(`${scope}/collections`, {
    data: {
      key: collectionKey,
      name: `__e2e__ Products ${suffix}`,
      singularName: 'Product',
      titleFieldKey: 'name',
      fields: [
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'slug', label: 'Slug', type: 'slug', required: true, unique: true },
        { key: 'image', label: 'Image', type: 'image', required: false },
        { key: 'price', label: 'Price', type: 'number', required: true },
        { key: 'description', label: 'Description', type: 'long-text', required: false },
        { key: 'featured', label: 'Featured', type: 'boolean', required: true },
      ],
    },
  });
  expect(collectionResponse.ok()).toBeTruthy();
  const collection = (await collectionResponse.json()) as { id: string };
  const values = {
    name: 'Product A',
    slug: `product-a-${suffix}`,
    image: '/assets/a.png',
    price: 100,
    description: 'Product A',
    featured: true,
  };
  const entryResponse = await page.request.post(
    `${scope}/collections/${collection.id}/entries`,
    { data: { values } },
  );
  expect(entryResponse.ok()).toBeTruthy();
  const entry = (await entryResponse.json()) as { id: string };
  const publishEntryResponse = await page.request.post(
    `${scope}/collections/${collection.id}/entries/${entry.id}/publish`,
  );
  expect(publishEntryResponse.ok()).toBeTruthy();

  const listPayload = {
    version: 7 as const,
    metadata: { documentTitle: 'Products' },
    root: {
      id: 'root',
      type: 'root' as const,
      props: {},
      children: [
        {
          id: 'products',
          type: 'collection-list' as const,
          props: { queryId, emptyMessage: 'No products' },
          children: [
            {
              id: 'item-template',
              type: 'collection-item' as const,
              props: {},
              children: [
                {
                  id: listHeadingId,
                  type: 'heading' as const,
                  props: { text: 'Product', level: 2 as const },
                  children: [],
                },
                {
                  id: listButtonId,
                  type: 'button' as const,
                  props: {
                    label: 'View product',
                    href: '/products',
                    target: '_blank' as const,
                  },
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    },
  };
  const query = {
    filters: [{ field: 'featured', operator: 'equals', value: true }],
    sort: [{ field: 'price', direction: 'desc' as const }],
    limit: 100,
    offset: 0,
  };
  const listComposition = {
    payload: listPayload,
    attachments: [],
    layoutAttachments: [],
    bindings: [
      {
        id: randomUUID(),
        targetNodeId: listHeadingId,
        targetProperty: 'text',
        source: { type: 'query-item' as const, sourceId: queryId, path: 'name' },
        fallback: 'Product',
      },
      {
        id: randomUUID(),
        targetNodeId: listButtonId,
        targetProperty: 'href',
        source: {
          type: 'query-item' as const,
          sourceId: queryId,
          path: 'slug',
          template: '/products/{value}',
        },
        fallback: '/products',
      },
    ],
    actions: [],
    resources: [],
    queries: [
      {
        id: queryId,
        source: { type: 'collection' as const, collectionId: collection.id },
        ...query,
      },
    ],
  };
  const listPageResponse = await page.request.patch(
    `${apiBase}/pages/${environment.pageId}`,
    {
      data: {
        name: '__e2e__ Phase 20.1 Products catalog',
        path: '/',
        slug: environment.pageSlug,
        payload: listPayload,
        composition: listComposition,
      },
    },
  );
  expect(listPageResponse.ok()).toBeTruthy();
  const publishListResponse = await page.request.post(
    `${apiBase}/pages/${environment.pageId}/publish`,
    { data: {} },
  );
  expect(publishListResponse.ok()).toBeTruthy();

  const dynamicPayload = {
    version: 7 as const,
    metadata: { documentTitle: 'Product detail' },
    root: {
      id: 'root',
      type: 'root' as const,
      props: {},
      children: [
        {
          id: 'section',
          type: 'section' as const,
          props: {},
          children: [
            {
              id: dynamicHeadingId,
              type: 'heading' as const,
              props: { text: 'Product', level: 1 as const },
              children: [],
            },
          ],
        },
      ],
    },
  };
  const dynamicPageResponse = await page.request.post(
    `${apiBase}/sites/${environment.siteId}/pages`,
    {
      data: {
        name: `__e2e__ Phase 20.1 Product detail ${suffix}`,
        slug: `phase20-product-detail-${suffix}`,
        kind: 'dynamic',
        collectionId: collection.id,
        pathPattern: '/products/{slug}',
        lookupField: 'slug',
        payload: dynamicPayload,
        composition: {
          payload: dynamicPayload,
          attachments: [],
          layoutAttachments: [],
          bindings: [
            {
              id: randomUUID(),
              targetNodeId: dynamicHeadingId,
              targetProperty: 'text',
              source: { type: 'current-entry' as const, path: 'name' },
              fallback: 'Product',
            },
          ],
          actions: [],
          resources: [],
          queries: [],
        },
      },
    },
  );
  expect(dynamicPageResponse.ok()).toBeTruthy();
  const dynamicPage = (await dynamicPageResponse.json()) as { id: string };
  const publishDynamicResponse = await page.request.post(
    `${apiBase}/pages/${dynamicPage.id}/publish`,
    { data: {} },
  );
  expect(publishDynamicResponse.ok()).toBeTruthy();

  return {
    collectionKey,
    cleanup: async () => {
      await page.request
        .post(`${apiBase}/pages/${environment.pageId}/unpublish`)
        .catch(() => undefined);
      await page.request
        .delete(`${apiBase}/pages/${dynamicPage.id}`)
        .catch(() => undefined);
      const baselinePayload = {
        version: 1 as const,
        metadata: { documentTitle: 'E2E Home' },
        root: { id: 'root', type: 'root' as const, props: {}, children: [] },
      };
      await page.request
        .patch(`${apiBase}/pages/${environment.pageId}`, {
          data: {
            name: 'E2E Home',
            path: '/',
            slug: environment.pageSlug,
            kind: 'standard',
            payload: baselinePayload,
            composition: {
              payload: baselinePayload,
              attachments: [],
              layoutAttachments: [],
              bindings: [],
              actions: [],
              resources: [],
              queries: [],
            },
          },
        })
        .catch(() => undefined);
      await page.request
        .delete(`${scope}/collections/${collection.id}/entries/${entry.id}`)
        .catch(() => undefined);
      await page.request
        .delete(`${scope}/collections/${collection.id}`)
        .catch(() => undefined);
    },
  };
}

test('Phase 20.1 collection management and dynamic page flow works in the browser @phase20.1', async ({
  page,
  canonicalEnvironment,
}) => {
  await loginToCanonicalBuilder(page, canonicalEnvironment);

  const sitesResponse = await page.request.get(
    `${apiBase}/workspaces/${canonicalEnvironment.workspaceId}/sites?limit=100&offset=0`,
  );
  expect(sitesResponse.ok()).toBeTruthy();
  const sites = (await sitesResponse.json()) as {
    items: Array<{ id: string; name: string; slug: string }>;
  };
  let productsSiteId: string | undefined;
  let productsSiteSlug: string | undefined;
  let productsCollectionKey = 'products';
  let collectionsResponse: Awaited<ReturnType<typeof page.request.get>> | undefined;
  for (const site of sites.items) {
    const response = await page.request.get(
      `${apiBase}/workspaces/${canonicalEnvironment.workspaceId}/sites/${site.id}/collections`,
    );
    if (!response.ok()) continue;
    const candidate = (await response.json()) as Array<{ key?: string }>;
    if (candidate.some((collection) => collection.key === 'products')) {
      productsSiteId = site.id;
      productsSiteSlug = site.slug;
      collectionsResponse = response;
      break;
    }
  }
  if (!productsSiteId) {
    productsSiteId = canonicalEnvironment.siteId;
    productsSiteSlug = canonicalEnvironment.siteSlug;
    const seededScenario = await seedCanonicalProductsScenario(page, {
      ...canonicalEnvironment,
      pageSlug: canonicalEnvironment.pageSlug,
    });
    productsCollectionKey = seededScenario.collectionKey;
    cleanupProductScenario = seededScenario.cleanup;
    collectionsResponse = await page.request.get(
      `${apiBase}/workspaces/${canonicalEnvironment.workspaceId}/sites/${productsSiteId}/collections`,
    );
  }
  expect(
    productsSiteId,
    'A site with the Products collection must be available',
  ).toBeTruthy();
  expect(productsSiteSlug).toBeTruthy();
  expect(collectionsResponse).toBeTruthy();
  const collections = (await collectionsResponse!.json()) as Array<{
    id: string;
    name: string;
    key: string;
    fields: Array<{ key: string }>;
  }>;
  const products = collections.find(
    (collection) => collection.key === productsCollectionKey,
  );
  expect(products, 'The Products collection must be available').toBeTruthy();

  await page.goto(
    `/workspaces/${canonicalEnvironment.workspaceId}/sites/${productsSiteId}/collections`,
  );
  await expect(page.locator('h1', { hasText: 'Collections' })).toBeVisible();
  const collectionCard = page
    .locator('.collection-library-item')
    .filter({ has: page.getByText(products!.key, { exact: true }) });
  await expect(collectionCard).toBeVisible();
  await collectionCard.click();
  await expect(page.getByText(/entries · page 1/)).toBeVisible();

  await page.getByRole('button', { name: 'Edit schema', exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(
      `/workspaces/${canonicalEnvironment.workspaceId}/sites/${productsSiteId}/collections/${products!.id}/schema$`,
    ),
  );
  await expect(
    page.getByRole('heading', { name: `${products!.name} schema` }),
  ).toBeVisible();
  await expect(page.locator('.ui-overlay-layer')).toHaveCount(0);
  await expect(page.locator('.ui-inline-surface')).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: `${products!.name} schema` }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Back to collections' }).click();
  await expect(page).toHaveURL(
    new RegExp(
      `/workspaces/${canonicalEnvironment.workspaceId}/sites/${productsSiteId}/collections/${products!.id}$`,
    ),
  );
  await collectionCard.click();
  await expect(page.getByText(/entries · page 1/)).toBeVisible();

  const search = page.getByPlaceholder(/search product entries/i);
  await search.fill('Product');
  await expect(page.locator('.collection-entry-row').first()).toBeVisible();
  await page
    .locator('.collection-entry-row')
    .first()
    .getByRole('button', { name: 'Edit' })
    .click();
  await expect(page).toHaveURL(
    new RegExp(
      `/workspaces/${canonicalEnvironment.workspaceId}/sites/${productsSiteId}/collections/${products!.id}/entries/[^/]+/edit$`,
    ),
  );
  const entryDrawer = page.getByRole('dialog', { name: 'Edit entry' });
  await expect(entryDrawer).toBeVisible();
  await expect(entryDrawer.getByText('Name', { exact: true })).toBeVisible();
  await entryDrawer.getByRole('button', { name: 'Close dialog' }).click();

  const pagesResponse = await page.request.get(
    `${apiBase}/sites/${productsSiteId}/pages?limit=100&offset=0`,
  );
  expect(pagesResponse.ok()).toBeTruthy();
  const pages = (await pagesResponse.json()) as {
    items: Array<{ id: string; name: string; kind: string; pathPattern?: string }>;
  };
  const dynamicPage = pages.items.find((candidate) => candidate.kind === 'dynamic');
  expect(
    dynamicPage,
    'The canonical dynamic Product Detail page must be seeded',
  ).toBeTruthy();

  const entriesResponse = await page.request.get(
    `${apiBase}/workspaces/${canonicalEnvironment.workspaceId}/sites/${productsSiteId}/collections/${products!.id}/entries?limit=100&offset=0`,
  );
  expect(entriesResponse.ok()).toBeTruthy();
  const entries = (await entriesResponse.json()) as {
    items: Array<{
      id: string;
      values: Record<string, unknown>;
      publishedVersionId?: string;
    }>;
  };
  const liveEntry = entries.items.find(
    (entry) =>
      Boolean(entry.publishedVersionId) &&
      entry.values.featured === true &&
      typeof entry.values.slug === 'string',
  );
  expect(liveEntry, 'The dynamic page must have a published lookup entry').toBeTruthy();
  const detailPath = dynamicPage!.pathPattern!.replace(
    /\{[a-z][a-z0-9_]*\}$/,
    encodeURIComponent(String(liveEntry!.values.slug)),
  );
  const publicDetail = await page.request.get(
    `${rendererBase}/${productsSiteSlug}${detailPath}`,
  );
  expect(publicDetail.ok(), 'The public dynamic detail route must resolve').toBeTruthy();
  expect(await publicDetail.text()).toContain(String(liveEntry!.values.name));

  const publicCatalog = await page.request.get(`${rendererBase}/${productsSiteSlug}`);
  expect(
    publicCatalog.ok(),
    'The public collection list route must resolve',
  ).toBeTruthy();
  expect(await publicCatalog.text()).toContain(
    `href="/${productsSiteSlug}/products/${encodeURIComponent(String(liveEntry!.values.slug))}"`,
  );
  const catalogBrowserPage = await page.context().newPage();
  await catalogBrowserPage.goto(`${rendererBase}/${productsSiteSlug}`);
  const catalogEntryCard = catalogBrowserPage
    .locator('[data-payload-node-type="collection-item"]')
    .filter({ hasText: String(liveEntry!.values.name) });
  const catalogEntryLink = catalogEntryCard.getByRole('link', { name: 'View product' });
  await expect(catalogEntryLink).toHaveAttribute(
    'href',
    `/${productsSiteSlug}/products/${encodeURIComponent(String(liveEntry!.values.slug))}`,
  );
  const detailPopupPromise = catalogBrowserPage.waitForEvent('popup');
  await catalogEntryLink.click();
  const detailPopup = await detailPopupPromise;
  await detailPopup.waitForLoadState('domcontentloaded');
  expect(detailPopup.url()).toBe(
    `${rendererBase}/${productsSiteSlug}/products/${encodeURIComponent(String(liveEntry!.values.slug))}`,
  );
  await detailPopup.close();
  await catalogBrowserPage.close();

  await page.goto(
    `/workspaces/${canonicalEnvironment.workspaceId}/sites/${productsSiteId}/pages`,
  );
  await expect(page.getByRole('heading', { name: 'Pages', exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: new RegExp(`Select page ${dynamicPage!.name}`) })
    .click();
  await expect(page).toHaveURL(
    new RegExp(
      `/workspaces/${canonicalEnvironment.workspaceId}/sites/${productsSiteId}/pages/${dynamicPage!.id}$`,
    ),
  );
  await expect(page.locator('.ui-drawer-layer')).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const pageDrawer = page.getByRole('dialog', { name: dynamicPage!.name });
  await expect(pageDrawer).toBeVisible();
  await pageDrawer.getByText('Advanced page options', { exact: true }).click();
  await expect(pageDrawer.getByLabel('Page type')).toHaveValue('dynamic');
  await expect(pageDrawer.getByLabel('Dynamic collection')).toHaveValue(products!.id);
  const previewEntry = pageDrawer.getByLabel('Preview entry');
  expect(await previewEntry.locator('option').count()).toBeGreaterThan(1);
  await expect(previewEntry).not.toHaveValue('');
  await previewEntry.selectOption(liveEntry!.id);
  const selectedEntryId = await previewEntry.inputValue();
  expect(selectedEntryId).toBeTruthy();
  await pageDrawer.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.locator('.ui-drawer-layer')).toHaveCount(0);
  const liveDetailUrl = `${rendererBase}/${productsSiteSlug}${detailPath}`;
  await expect(page.getByRole('link', { name: liveDetailUrl })).toHaveAttribute(
    'href',
    liveDetailUrl,
  );

  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Preview', exact: true }).last().click();
  const popup = await popupPromise;
  expect(popup.url()).toContain(`entryId=${encodeURIComponent(selectedEntryId)}`);
  await popup.waitForLoadState('domcontentloaded');
  await expect(popup.locator('[data-renderer-state="not-found"]')).toHaveCount(0);
  await expect(popup.locator('.preview-banner')).toBeVisible();
  await expect(
    popup.getByText(String(liveEntry!.values.name), { exact: true }),
  ).toBeVisible();
  await popup.close();
});
