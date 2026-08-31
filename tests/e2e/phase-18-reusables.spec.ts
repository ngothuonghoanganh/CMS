import { expect, test, type Page } from '@playwright/test';

const email = process.env.AUTH_EMAIL ?? 'admin@example.com';
const password = process.env.AUTH_PASSWORD ?? 'change-me-in-development';

async function login(page: Page) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function apiRequest(
  page: Page,
  input: { path: string; method?: string; body?: unknown },
): Promise<{ status: number; body: unknown }> {
  return page.evaluate(async ({ path, method, body }) => {
    const response = await fetch(`http://127.0.0.1:3001/api/v1${path}`, {
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      method: method ?? 'GET',
    });
    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch {
      responseBody = undefined;
    }
    return { body: responseBody, status: response.status };
  }, input);
}

function reusableDocument(text: string) {
  return {
    version: 1 as const,
    root: {
      id: 'phase18-source-section',
      type: 'section' as const,
      props: {},
      children: [
        {
          id: 'phase18-source-heading',
          type: 'heading' as const,
          props: { text, level: 2 as const },
          children: [],
        },
      ],
    },
  };
}

test('linked reusables propagate published source updates and survive archive', async ({
  page,
}) => {
  const suffix = Date.now().toString();
  const siteSlug = `phase18-site-${suffix}`;
  const pageSlug = `phase18-page-${suffix}`;
  const siteName = `Phase 18 Site ${suffix}`;

  await login(page);
  await page.getByRole('button', { name: 'Sites', exact: true }).click();
  await page.getByLabel('Site name').fill(siteName);
  await page.getByLabel('Slug').fill(siteSlug);
  await page.getByRole('button', { name: 'Create site' }).click();
  await expect(page.getByRole('status')).toContainText('Site created');
  await page.getByRole('button', { name: 'Pages', exact: true }).click();
  await page.getByLabel('Page name').fill(`Phase 18 Page ${suffix}`);
  await page.getByLabel('Slug').fill(pageSlug);
  await page.getByRole('button', { name: 'Create page' }).click();
  await page.getByRole('button', { name: 'Open Builder' }).click();
  await expect(page.locator('iframe.gjs-frame')).toBeVisible({ timeout: 15_000 });

  const match = page
    .url()
    .match(/\/workspaces\/([^/]+)\/sites\/([^/]+)\/pages\/([^/]+)\/builder$/);
  expect(match).not.toBeNull();
  const [, workspaceId, siteId, pageId] = match!;
  const source = reusableDocument('Shared heading v1');
  const reusableResponse = await apiRequest(page, {
    body: {
      name: 'Phase 18 shared heading',
      kind: 'section',
      document: source,
    },
    method: 'POST',
    path: `/workspaces/${workspaceId}/sites/${siteId}/reusables`,
  });
  expect(reusableResponse.status).toBe(201);
  const reusableId = (reusableResponse.body as { id: string }).id;
  await page.reload();
  await expect(page.locator('iframe.gjs-frame')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('tab', { name: 'Saved' }).click();
  await expect(page.getByText('Phase 18 shared heading', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit source' }).click();
  await expect(
    page.getByRole('heading', { name: 'Phase 18 shared heading', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Back to page document' }).click();
  await expect(page.getByRole('heading', { name: /Phase 18 Page/ })).toBeVisible();
  const sitePages = await apiRequest(page, {
    path: `/sites/${siteId}/pages?limit=100`,
  });
  const homepage = (
    sitePages.body as { items: Array<{ id: string; path: string }> }
  ).items.find((candidate) => candidate.path === '/');
  expect(homepage).toBeTruthy();
  const homepagePublish = await apiRequest(page, {
    body: {},
    method: 'POST',
    path: `/pages/${homepage!.id}/publish`,
  });
  expect(homepagePublish.status, JSON.stringify(homepagePublish.body)).toBe(201);

  const linkedPayload = {
    version: 7 as const,
    metadata: { documentTitle: 'Phase 18 linked page' },
    root: {
      id: 'root',
      type: 'root' as const,
      props: {},
      children: [
        {
          id: 'phase18-linked-instance',
          type: 'reusable-instance' as const,
          props: { reusableId },
          children: [],
        },
      ],
    },
  };
  const saveResponse = await apiRequest(page, {
    body: { expectedVersionNumber: 1, payload: linkedPayload },
    method: 'POST',
    path: `/pages/${pageId}/versions`,
  });
  expect(saveResponse.status).toBe(201);
  expect(
    (saveResponse.body as { payload: typeof linkedPayload }).payload.root.children[0]
      ?.children,
  ).toEqual([]);

  const pagePublish = await apiRequest(page, {
    body: {},
    method: 'POST',
    path: `/pages/${pageId}/publish`,
  });
  expect(pagePublish.status, JSON.stringify(pagePublish.body)).toBe(201);
  const sitePublish = await apiRequest(page, {
    body: {},
    method: 'POST',
    path: `/workspaces/${workspaceId}/sites/${siteId}/publish`,
  });
  expect(sitePublish.status, JSON.stringify(sitePublish.body)).toBe(201);

  const publicPath = `/api/v1/public/sites/${siteSlug}/pages/${pageSlug}`;
  const firstPublic = await page.request.get(`http://127.0.0.1:3001${publicPath}`);
  expect(firstPublic.status()).toBe(200);
  expect(
    (await firstPublic.json()).reusables[0].document.root.children[0].props.text,
  ).toBe('Shared heading v1');

  const updateResponse = await apiRequest(page, {
    body: { document: reusableDocument('Shared heading v2') },
    method: 'PATCH',
    path: `/workspaces/${workspaceId}/sites/${siteId}/reusables/${reusableId}`,
  });
  expect(updateResponse.status).toBe(200);

  const unchangedPublic = await page.request.get(`http://127.0.0.1:3001${publicPath}`);
  expect(
    (await unchangedPublic.json()).reusables[0].document.root.children[0].props.text,
  ).toBe('Shared heading v1');

  const updatedSitePublish = await apiRequest(page, {
    body: {},
    method: 'POST',
    path: `/workspaces/${workspaceId}/sites/${siteId}/publish`,
  });
  expect(updatedSitePublish.status, JSON.stringify(updatedSitePublish.body)).toBe(201);
  const updatedPublic = await page.request.get(`http://127.0.0.1:3001${publicPath}`);
  expect(
    (await updatedPublic.json()).reusables[0].document.root.children[0].props.text,
  ).toBe('Shared heading v2');

  const archiveResponse = await apiRequest(page, {
    method: 'DELETE',
    path: `/workspaces/${workspaceId}/sites/${siteId}/reusables/${reusableId}`,
  });
  expect(archiveResponse.status).toBe(204);
  const activeLibrary = await apiRequest(page, {
    path: `/workspaces/${workspaceId}/sites/${siteId}/reusables?limit=100`,
  });
  expect(activeLibrary.status).toBe(200);
  expect(
    (activeLibrary.body as { items: Array<{ id: string }> }).items.some(
      (item) => item.id === reusableId,
    ),
  ).toBe(false);

  const archivedPublic = await page.request.get(`http://127.0.0.1:3001${publicPath}`);
  expect(archivedPublic.status()).toBe(200);
  expect(
    (await archivedPublic.json()).reusables[0].document.root.children[0].props.text,
  ).toBe('Shared heading v2');
});
