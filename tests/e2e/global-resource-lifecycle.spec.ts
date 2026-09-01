import { expect, type APIRequestContext, type Page } from '@playwright/test';

import { openCanonicalBuilder, test } from './fixtures/canonical-environment';

const apiBase = process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';
const rendererBase = process.env.E2E_RENDERER_BASE_URL ?? 'http://127.0.0.1:3002';

async function json<T>(
  response: Awaited<ReturnType<APIRequestContext['get']>>,
): Promise<T> {
  if (!response.ok()) {
    throw new Error(`API ${response.url()} failed with ${response.status()}`);
  }
  return (await response.json()) as T;
}

async function getGlobals(
  request: APIRequestContext,
  workspaceId: string,
  siteId: string,
): Promise<{
  draft: { header?: unknown | null; footer?: unknown | null };
  published?: { header?: unknown | null; footer?: unknown | null };
  state: {
    header: { hasPublishedSnapshot: boolean; hasUnpublishedChanges: boolean };
    footer: { hasPublishedSnapshot: boolean; hasUnpublishedChanges: boolean };
  };
}> {
  return json(
    await request.get(`${apiBase}/workspaces/${workspaceId}/sites/${siteId}/globals`),
  );
}

async function openPublicHome(browser: Page, siteSlug: string): Promise<void> {
  await browser.goto(`${rendererBase}/${siteSlug}?refresh=${Date.now()}`);
}

test('Phase 18.5 keeps header and footer drafts and publishes resource-scoped changes', async ({
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
    'global-resource-lifecycle',
  );
  let publicPage: Page | undefined;
  let previewPage: Page | undefined;

  try {
    const documentSelector = page.getByLabel('Editing document');
    await documentSelector.selectOption('site-header');
    await page
      .getByRole('button', { name: 'Brand · Menu · CTA add', exact: true })
      .click();
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByText('Draft · Not published', { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    const savedHeader = await getGlobals(
      request,
      canonicalEnvironment.workspaceId,
      canonicalEnvironment.siteId,
    );
    expect(savedHeader.draft.header).toBeTruthy();
    expect(savedHeader.state.header).toEqual({
      hasPublishedSnapshot: false,
      hasUnpublishedChanges: true,
    });

    const previewPopup = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Live preview', exact: true }).click();
    previewPage = await previewPopup;
    await expect(previewPage.locator('[data-site-global="header"]')).toHaveCount(1);

    await page.getByRole('button', { name: 'Publish Header', exact: true }).click();
    await expect(page.getByText('Live · Up to date', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    const publishedHeader = await getGlobals(
      request,
      canonicalEnvironment.workspaceId,
      canonicalEnvironment.siteId,
    );
    expect(publishedHeader.state.header).toEqual({
      hasPublishedSnapshot: true,
      hasUnpublishedChanges: false,
    });
    const startHeaderDraftFromLive = page.getByRole('button', {
      name: 'Start Header draft from live',
      exact: true,
    });
    await expect(startHeaderDraftFromLive).toBeVisible();
    await startHeaderDraftFromLive.click();
    await expect(page.getByText('Live · Unsaved changes', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByText('Live · Up to date', { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await documentSelector.selectOption('site-footer');
    await page
      .getByRole('button', { name: 'Brand · Menu · Legal add', exact: true })
      .click();
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByText('Draft · Not published', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: 'Publish Footer', exact: true }).click();
    await expect(page.getByText('Live · Up to date', { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    const independentPublish = await getGlobals(
      request,
      canonicalEnvironment.workspaceId,
      canonicalEnvironment.siteId,
    );
    expect(independentPublish.state.header.hasUnpublishedChanges).toBe(false);
    expect(independentPublish.state.footer.hasUnpublishedChanges).toBe(false);
    expect(independentPublish.published?.header).toBeTruthy();
    expect(independentPublish.published?.footer).toBeTruthy();

    await json(
      await request.post(`${apiBase}/pages/${canonicalEnvironment.pageId}/publish`, {
        data: {},
      }),
    );
    await json(
      await request.post(
        `${apiBase}/workspaces/${canonicalEnvironment.workspaceId}/sites/${canonicalEnvironment.siteId}/publish`,
        { data: {} },
      ),
    );
    publicPage = await browser.newPage();
    await openPublicHome(publicPage, source.siteSlug);
    await expect(publicPage.locator('[data-site-global="header"]')).toHaveCount(1);
    await expect(publicPage.locator('[data-site-global="footer"]')).toHaveCount(1);

    await documentSelector.selectOption('site-header');
    await expect(
      page.getByRole('heading', { name: 'Global Header', exact: true }),
    ).toBeVisible();
    if (!previewPage) throw new Error('The live preview window was not opened');
    await expect(previewPage.locator('[data-site-global="header"]')).toHaveCount(1);
    page.once('dialog', (dialog) => void dialog.accept());
    await page
      .getByRole('button', { name: 'Remove Header from draft', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Header removed from draft' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(
      page.getByText('Live · Draft saved · Not published', { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(previewPage.locator('[data-site-global="header"]')).toHaveCount(0);
    await expect(publicPage.locator('[data-site-global="header"]')).toHaveCount(1);

    page.once('dialog', (dialog) => void dialog.accept());
    await page
      .getByRole('button', { name: 'Revert Header to live version', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Global Header', exact: true }),
    ).toBeVisible();
    await expect(previewPage.locator('[data-site-global="header"]')).toHaveCount(1);
    await expect(publicPage.locator('[data-site-global="header"]')).toHaveCount(1);

    page.once('dialog', (dialog) => void dialog.accept());
    await page
      .getByRole('button', { name: 'Remove Header from draft', exact: true })
      .click();
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(
      page.getByText('Live · Draft saved · Not published', { exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Publish Header', exact: true }).click();
    await expect(page.getByText('Draft · Not published', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await openPublicHome(publicPage, source.siteSlug);
    await expect(publicPage.locator('[data-site-global="header"]')).toHaveCount(0);
    await expect(publicPage.locator('[data-site-global="footer"]')).toHaveCount(1);
  } finally {
    await previewPage?.close();
    await publicPage?.close();
    await source.dispose();
  }
});
