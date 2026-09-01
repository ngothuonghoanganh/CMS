import { expect, type APIResponse, type Page } from '@playwright/test';

import {
  createTemporaryPage,
  openCanonicalBuilder,
  test,
} from './fixtures/canonical-environment';

const apiBase = process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';
const rendererBase = process.env.E2E_RENDERER_BASE_URL ?? 'http://127.0.0.1:3002';

type Navigation = {
  id: string;
  key: string;
  name: string;
  items: NavigationItem[];
  draftItems?: NavigationItem[];
  publishedItems?: NavigationItem[];
};

type NavigationItem = {
  id: string;
  label: string;
  type: 'page' | 'external';
  pageId?: string;
  externalUrl?: string;
};

async function json<T>(response: APIResponse): Promise<T> {
  if (!response.ok()) {
    throw new Error(`API ${response.url()} failed with ${response.status()}`);
  }
  return (await response.json()) as T;
}

function navigationPagePayload() {
  return {
    version: 1,
    metadata: { documentTitle: 'Navigation lifecycle source' },
    root: { id: 'root', type: 'root', props: {}, children: [] },
  };
}

async function openPublicSource(browserPage: Page, siteSlug: string, sourceSlug: string) {
  await browserPage.goto(
    `${rendererBase}/${siteSlug}/${sourceSlug}?refresh=${Date.now()}`,
  );
}

function mainNavigation(page: Page) {
  return page.getByRole('navigation', { name: 'Main navigation', exact: true });
}

test('navigation structure publishes independently from page availability', async ({
  browser,
  page,
  request,
  canonicalEnvironment,
}) => {
  test.setTimeout(120_000);
  const source = await openCanonicalBuilder(
    page,
    request,
    canonicalEnvironment,
    'navigation-source',
    navigationPagePayload(),
  );
  const target = await createTemporaryPage(
    request,
    canonicalEnvironment,
    'navigation-target',
  );
  const globalsBefore = await json<{ draft: unknown }>(
    await request.get(
      `${apiBase}/workspaces/${canonicalEnvironment.workspaceId}/sites/${canonicalEnvironment.siteId}/globals`,
    ),
  );
  const navigationResponse = await request.get(
    `${apiBase}/sites/${canonicalEnvironment.siteId}/navigations`,
  );
  const navigations = await json<{ items: Navigation[] }>(navigationResponse);
  const main = navigations.items.find((item) => item.key === 'main');
  const originalDraftItems = main?.draftItems ?? main?.items ?? [];
  const draftItems: NavigationItem[] = [
    {
      id: '00000000-0000-4000-8000-000000000021',
      label: 'Home',
      type: 'page',
      pageId: canonicalEnvironment.pageId,
    },
    {
      id: '00000000-0000-4000-8000-000000000022',
      label: 'Sample Landing Page',
      type: 'page',
      pageId: target.id,
    },
  ];
  let navigationChanged = false;
  let globalsChanged = false;
  let publicPage: Page | undefined;

  try {
    await page.getByLabel('Editing document').selectOption('site-header');
    await expect(
      page.getByRole('heading', { name: 'Global Header', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Brand · Menu · CTA add', exact: true })
      .click();
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(
      page.getByText('Saved · global draft · not published', { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    globalsChanged = true;
    if (!main) throw new Error('Canonical site did not expose a main navigation');
    const updateNavigation = await request.patch(
      `${apiBase}/sites/${canonicalEnvironment.siteId}/navigations/${main.id}`,
      { data: { name: main.name, items: draftItems } },
    );
    await json<Navigation>(updateNavigation);
    navigationChanged = true;

    await json(
      await request.post(`${apiBase}/pages/${canonicalEnvironment.pageId}/publish`, {
        data: {},
      }),
    );
    await json(await request.post(`${apiBase}/pages/${source.id}/publish`, { data: {} }));
    await json(
      await request.post(
        `${apiBase}/workspaces/${canonicalEnvironment.workspaceId}/sites/${canonicalEnvironment.siteId}/publish`,
        { data: {} },
      ),
    );

    publicPage = await browser.newPage({ baseURL: rendererBase });
    await openPublicSource(publicPage, source.siteSlug, source.slug);
    await expect(
      mainNavigation(publicPage).getByRole('menuitem', { name: 'Home', exact: true }),
    ).toBeVisible();
    await expect(
      mainNavigation(publicPage).getByRole('menuitem', {
        name: 'Sample Landing Page',
        exact: true,
      }),
    ).toHaveCount(0);

    const previewPopup = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Live preview', exact: true }).click();
    const previewPage = await previewPopup;
    await expect(
      mainNavigation(previewPage).getByRole('menuitem', {
        name: 'Sample Landing Page',
        exact: true,
      }),
    ).toBeVisible({ timeout: 15_000 });
    await previewPage.close();

    await json(await request.post(`${apiBase}/pages/${target.id}/publish`, { data: {} }));
    await openPublicSource(publicPage, source.siteSlug, source.slug);
    await expect(
      mainNavigation(publicPage).getByRole('menuitem', {
        name: 'Sample Landing Page',
        exact: true,
      }),
    ).toBeVisible();

    await json(await request.post(`${apiBase}/pages/${target.id}/unpublish`));
    await openPublicSource(publicPage, source.siteSlug, source.slug);
    await expect(
      mainNavigation(publicPage).getByRole('menuitem', {
        name: 'Sample Landing Page',
        exact: true,
      }),
    ).toHaveCount(0);

    const editedDraftItems: NavigationItem[] = [
      ...draftItems,
      {
        id: '00000000-0000-4000-8000-000000000023',
        label: 'Blog',
        type: 'external',
        externalUrl: 'https://example.com/blog',
      },
    ];
    await json<Navigation>(
      await request.patch(
        `${apiBase}/sites/${canonicalEnvironment.siteId}/navigations/${main.id}`,
        { data: { name: main.name, items: editedDraftItems } },
      ),
    );
    await page.reload();
    await expect(page.locator('.gjs-editor')).toBeVisible({ timeout: 15_000 });
    const editedPreviewPopup = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Live preview', exact: true }).click();
    const editedPreviewPage = await editedPreviewPopup;
    await expect(
      mainNavigation(editedPreviewPage).getByRole('menuitem', {
        name: 'Blog',
        exact: true,
      }),
    ).toBeVisible({
      timeout: 15_000,
    });
    await editedPreviewPage.close();

    await openPublicSource(publicPage, source.siteSlug, source.slug);
    await expect(
      mainNavigation(publicPage).getByRole('menuitem', { name: 'Blog', exact: true }),
    ).toHaveCount(0);
    await json(
      await request.post(
        `${apiBase}/workspaces/${canonicalEnvironment.workspaceId}/sites/${canonicalEnvironment.siteId}/publish`,
        { data: {} },
      ),
    );
    await openPublicSource(publicPage, source.siteSlug, source.slug);
    await expect(
      mainNavigation(publicPage).getByRole('menuitem', { name: 'Blog', exact: true }),
    ).toBeVisible();
  } finally {
    await publicPage?.close();
    if (navigationChanged && main) {
      await request.patch(
        `${apiBase}/sites/${canonicalEnvironment.siteId}/navigations/${main.id}`,
        { data: { name: main.name, items: originalDraftItems } },
      );
    }
    if (globalsChanged) {
      await request.patch(
        `${apiBase}/workspaces/${canonicalEnvironment.workspaceId}/sites/${canonicalEnvironment.siteId}/globals`,
        { data: globalsBefore.draft },
      );
    }
    if (navigationChanged || globalsChanged) {
      await request.post(
        `${apiBase}/workspaces/${canonicalEnvironment.workspaceId}/sites/${canonicalEnvironment.siteId}/publish`,
        { data: {} },
      );
    }
    await target.dispose();
    await source.dispose();
  }
});
