import { expect } from '@playwright/test';

import { loginToCanonicalBuilder, test } from './fixtures/canonical-environment';

const apiBase = process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';
const rendererBase =
  process.env.E2E_RENDERER_BASE_URL ??
  process.env.NEXT_PUBLIC_RENDERER_BASE_URL ??
  'http://127.0.0.1:3002';

test('Phase 20.1 collection management and dynamic page flow works in the browser @phase20.1', async ({
  page,
  canonicalEnvironment,
}) => {
  await loginToCanonicalBuilder(page);

  const sitesResponse = await page.request.get(
    `${apiBase}/workspaces/${canonicalEnvironment.workspaceId}/sites?limit=100&offset=0`,
  );
  expect(sitesResponse.ok()).toBeTruthy();
  const sites = (await sitesResponse.json()) as {
    items: Array<{ id: string; name: string; slug: string }>;
  };
  let productsSiteId: string | undefined;
  let productsSiteSlug: string | undefined;
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
  expect(
    productsSiteId,
    'A site with the canonical Products collection must be seeded',
  ).toBeTruthy();
  expect(productsSiteSlug).toBeTruthy();
  expect(collectionsResponse).toBeTruthy();
  const collections = (await collectionsResponse!.json()) as Array<{
    id: string;
    name: string;
    key: string;
    fields: Array<{ key: string }>;
  }>;
  const products = collections.find((collection) => collection.key === 'products');
  expect(products, 'The canonical Products collection must be seeded').toBeTruthy();

  await page.goto(`/?view=collections&siteId=${encodeURIComponent(productsSiteId!)}`);
  await expect(page.locator('h1', { hasText: 'Collections' })).toBeVisible();
  const collectionCard = page
    .locator('.collection-library-item')
    .filter({ hasText: products!.name });
  await expect(collectionCard).toBeVisible();
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

  await page.goto(`/?view=pages&siteId=${encodeURIComponent(productsSiteId!)}`);
  await expect(page.getByRole('heading', { name: 'Pages', exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: new RegExp(`Select page ${dynamicPage!.name}`) })
    .click();
  const pageDrawer = page.getByRole('dialog', { name: dynamicPage!.name });
  await expect(pageDrawer).toBeVisible();
  await expect(pageDrawer.getByLabel('Page type')).toHaveValue('dynamic');
  await expect(pageDrawer.getByLabel('Dynamic collection')).toHaveValue(products!.id);
  const previewEntry = pageDrawer.getByLabel('Preview entry');
  expect(await previewEntry.locator('option').count()).toBeGreaterThan(1);
  await expect(previewEntry).not.toHaveValue('');
  await previewEntry.selectOption(liveEntry!.id);
  const selectedEntryId = await previewEntry.inputValue();
  expect(selectedEntryId).toBeTruthy();
  await pageDrawer.getByRole('button', { name: 'Close dialog' }).click();
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
