import { expect, type Page } from '@playwright/test';
import {
  canonicalEnvironmentNames,
  loginToCanonicalBuilder,
  openCanonicalBuilder,
  switchCanonicalBrowserContext,
  test,
} from './fixtures/canonical-environment';

async function openPages(page: Page, siteName?: string) {
  await page.getByRole('button', { name: 'Pages', exact: true }).click();
  if (siteName) {
    await page.getByLabel('Site').selectOption({ label: siteName });
  }
}

async function returnToPages(page: Page, siteName: string) {
  await page.getByRole('button', { name: '← Pages' }).click();
  await openPages(page, siteName);
}

test('publishes, isolates a newer draft, republishes, and unpublishes', async ({
  browser,
  page,
  request,
  canonicalEnvironment,
}) => {
  const temporaryPage = await openCanonicalBuilder(
    page,
    request,
    canonicalEnvironment,
    'phase-publishing',
  );
  const siteName = canonicalEnvironmentNames.siteName;
  const siteSlug = temporaryPage.siteSlug;
  const pageName = temporaryPage.name;
  const pageSlug = temporaryPage.slug;

  await page.getByRole('button', { name: /^Section/ }).click();
  await page.getByRole('button', { name: /^Text/ }).click();
  await page.getByLabel('Text content').fill('Published content A');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Saved · v2')).toBeVisible({ timeout: 15_000 });

  await returnToPages(page, siteName);
  await page.getByRole('button', { name: pageName }).click();
  await page.getByRole('button', { name: 'Publish draft' }).click();
  await page.getByRole('button', { name: 'Publish version' }).click();
  await expect(page.getByRole('status')).toContainText('Page published');

  const publicPage = await browser.newPage({ baseURL: 'http://127.0.0.1:3002' });
  const publicUrl = `/${siteSlug}/${pageSlug}`;
  await publicPage.goto(publicUrl);
  await expect(publicPage.getByText('Published content A')).toBeVisible();

  await page.getByRole('button', { name: 'Open Builder' }).click();
  await expect(page.locator('.builder-editor-host iframe.gjs-frame')).toBeAttached({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: /^Section/ }).click();
  await page.getByRole('button', { name: /^Text/ }).click();
  await page.getByLabel('Text content').fill('Draft content B');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Saved · v3')).toBeVisible({ timeout: 15_000 });

  await returnToPages(page, siteName);
  await page.getByRole('button', { name: pageName }).click();
  await expect(page.getByText('Newer draft', { exact: true }).first()).toBeVisible();
  await publicPage.goto(`${publicUrl}?refresh=${Date.now()}`);
  await expect(publicPage.getByText('Published content A')).toBeVisible();
  await expect(publicPage.getByText('Draft content B')).toHaveCount(0);

  await page.getByRole('button', { name: 'Publish draft' }).click();
  await page.getByRole('button', { name: 'Publish version' }).click();
  await expect(page.getByRole('status')).toContainText('Page published');
  await publicPage.reload();
  await expect(publicPage.getByText('Draft content B')).toBeVisible();

  await page.getByRole('button', { name: 'Unpublish' }).click();
  await expect(page.getByRole('status')).toContainText('Page unpublished');
  const unpublishedResponse = await request.get(
    `http://127.0.0.1:3001/api/v1/public/sites/${siteSlug}/pages/${pageSlug}`,
  );
  expect(unpublishedResponse.status()).toBe(404);
  const rendererResponse = await publicPage.goto(`${publicUrl}?refresh=${Date.now()}`);
  expect(rendererResponse?.status()).toBe(404);

  await publicPage.close();
});

test('publishes a site after its homepage is published', async ({
  page,
  request,
  canonicalEnvironment,
}) => {
  const siteName = canonicalEnvironmentNames.siteName;
  await loginToCanonicalBuilder(page);
  await switchCanonicalBrowserContext(page, canonicalEnvironment);
  await page.getByRole('button', { name: 'Pages', exact: true }).click();
  await page.getByLabel('Site').selectOption({ label: siteName });
  await page.getByRole('button', { name: /Select page .* at \/$/ }).click();
  const publishPageButton = page.getByRole('button', { name: 'Publish draft' });
  if (await publishPageButton.isVisible()) {
    await publishPageButton.click();
    await page.getByRole('button', { name: 'Publish version' }).click();
    await expect(page.getByRole('status')).toContainText('Page published');
  }

  await page.getByRole('button', { name: 'Sites', exact: true }).click();
  const siteRow = page.getByRole('row').filter({ hasText: siteName });
  const publishSiteButton = siteRow.getByRole('button', { name: 'Publish site' });
  if (await publishSiteButton.isVisible()) {
    await publishSiteButton.click();
    await expect(page.getByRole('status')).toContainText('Site published');
  }
  await expect(siteRow.getByRole('button', { name: 'Published' })).toBeDisabled();
  await request.post(
    `http://127.0.0.1:3001/api/v1/pages/${canonicalEnvironment.pageId}/unpublish`,
  );
});
