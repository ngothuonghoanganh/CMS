import { expect, test, type Page } from '@playwright/test';

const email = process.env.AUTH_EMAIL ?? 'admin@example.com';
const password = process.env.AUTH_PASSWORD ?? 'change-me-in-development';
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

type BuilderNode = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  children: BuilderNode[];
};

async function openBuilder(page: Page): Promise<{
  siteSlug: string;
  workspaceId: string;
  siteId: string;
}> {
  const suffix = Date.now().toString();
  const siteSlug = `phase-17-${suffix}`;
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('button', { name: 'Sites', exact: true }).click();
  await page.getByLabel('Site name').fill(`Phase 17 Site ${suffix}`);
  await page.getByLabel('Slug').fill(siteSlug);
  await page.getByRole('button', { name: 'Create site' }).click();
  await expect(page.getByRole('status')).toContainText('Site created');
  await page.getByRole('button', { name: 'Pages', exact: true }).click();
  await page.getByLabel('Page name').fill(`Phase 17 Page ${suffix}`);
  await page.getByLabel('Slug').fill(`phase-17-page-${suffix}`);
  await page.getByRole('button', { name: 'Create page' }).click();
  await expect(page.getByRole('status')).toContainText('draft version 1 created');
  await page.getByRole('button', { name: 'Open Builder' }).click();
  await expect(page.locator('.gjs-editor')).toBeVisible({ timeout: 15_000 });
  const [, , workspaceId, , siteId] = new URL(page.url()).pathname.split('/');
  if (!workspaceId || !siteId) throw new Error('Builder URL did not include site scope');
  return { siteSlug, workspaceId, siteId };
}

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
}) => {
  test.setTimeout(120_000);
  const { siteSlug, siteId, workspaceId } = await openBuilder(page);

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
  await expect(page.getByText('Saved · global draft', { exact: true })).toBeVisible({
    timeout: 15_000,
  });

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
    /Phase 17 Site/,
  );
});
