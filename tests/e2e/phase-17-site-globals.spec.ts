import { expect } from '@playwright/test';
import { openCanonicalBuilder, test } from './fixtures/canonical-environment';
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

type BuilderNode = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  children: BuilderNode[];
};

async function scopedApiRequest(
  page: Page,
  path: string,
  method: 'GET' | 'POST',
): Promise<{ status: number; body: unknown }> {
  return page.evaluate(
    async ({ apiBaseUrl: baseUrl, method: requestMethod, path: requestPath }) => {
      const response = await fetch(`${baseUrl}${requestPath}`, {
        credentials: 'include',
        method: requestMethod,
        ...(requestMethod === 'POST'
          ? {
              body: '{}',
              headers: { 'content-type': 'application/json' },
            }
          : {}),
      });
      return { status: response.status, body: await response.json() };
    },
    { apiBaseUrl, method, path },
  );
}

async function readEditorDocument(page: Page): Promise<{
  documentKind?: string;
  root: BuilderNode;
}> {
  const document = await page.evaluate(() => {
    const debug = (
      window as Window & { __payloadBuilderDebug?: { getPayload: () => unknown } }
    ).__payloadBuilderDebug;
    return debug?.getPayload();
  });
  expect(document).toBeTruthy();
  return document as { documentKind?: string; root: BuilderNode };
}

test('Phase 17 switches isolated global documents, applies presets, and persists drafts', async ({
  page,
  request,
  canonicalEnvironment,
}) => {
  test.setTimeout(120_000);
  const { siteSlug, siteId, workspaceId } = await openCanonicalBuilder(
    page,
    request,
    canonicalEnvironment,
    'phase-17-globals',
  );

  const documentSelector = page.getByLabel('Editing document');
  await expect(documentSelector).toHaveValue('page');
  await documentSelector.selectOption('site-header');
  await expect(
    page.getByRole('heading', { name: 'Global Header', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Brand · Menu · CTA add', exact: true }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Brand · Menu · CTA add', exact: true }).click();
  let document = await readEditorDocument(page);
  expect(document.documentKind).toBe('site-header');
  expect(document.root.children).toHaveLength(1);
  expect(document.root.children[0]?.type).toBe('global-header');
  expect(document.root.children[0]?.children.map((child) => child.type)).toEqual([
    'site-brand',
    'navigation-view',
    'button',
  ]);

  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(
    page.getByText('Saved · global draft · not published', { exact: true }),
  ).toBeVisible({
    timeout: 15_000,
  });

  const previewPagePromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Live preview', exact: true }).click();
  const previewPage = await previewPagePromise;
  await expect(previewPage.locator('[data-site-global="header"]')).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    previewPage.locator('[data-payload-node-type="site-brand"]'),
  ).toContainText(/E2E Builder Site/);
  await previewPage.close();

  await documentSelector.selectOption('site-footer');
  await expect(
    page.getByRole('heading', { name: 'Global Footer', exact: true }),
  ).toBeVisible();
  document = await readEditorDocument(page);
  expect(document.documentKind).toBe('site-footer');
  expect(document.root.children[0]?.type).toBe('global-footer');
  expect(document.root.children[0]?.children).toHaveLength(0);

  await documentSelector.selectOption('site-header');
  await expect(
    page.getByRole('heading', { name: 'Global Header', exact: true }),
  ).toBeVisible();
  document = await readEditorDocument(page);
  expect(document.root.children[0]?.children.map((child) => child.type)).toEqual([
    'site-brand',
    'navigation-view',
    'button',
  ]);

  const pagesResponse = await scopedApiRequest(
    page,
    `/sites/${siteId}/pages?limit=100`,
    'GET',
  );
  expect(pagesResponse.status).toBe(200);
  const homePage = (
    pagesResponse.body as { items: Array<{ id: string; path: string }> }
  ).items.find((item) => item.path === '/');
  if (!homePage) throw new Error('The created site did not expose a homepage');

  const pagePublishResponse = await scopedApiRequest(
    page,
    `/pages/${homePage.id}/publish`,
    'POST',
  );
  expect(pagePublishResponse.status).toBe(201);
  const sitePublishResponse = await scopedApiRequest(
    page,
    `/workspaces/${workspaceId}/sites/${siteId}/publish`,
    'POST',
  );
  expect(sitePublishResponse.status).toBe(201);

  await page.goto(`http://127.0.0.1:3002/${siteSlug}`);
  await expect(page.locator('[data-site-global="header"]')).toBeVisible();
  await expect(page.locator('[data-payload-node-type="site-brand"]')).toContainText(
    /E2E Builder Site/,
  );
});
