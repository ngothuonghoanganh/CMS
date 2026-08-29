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
}) => {
  const suffix = Date.now().toString();
  const siteSlug = `publish-site-${suffix}`;
  const pageSlug = `publish-page-${suffix}`;
  const pageName = `Publish Page ${suffix}`;

  await login(page);
  await page.getByRole('button', { name: 'Sites', exact: true }).click();
  await page.getByLabel('Site name').fill(`Publish Site ${suffix}`);
  await page.getByLabel('Slug').fill(siteSlug);
  await page.getByRole('button', { name: 'Create site' }).click();
  await expect(page.getByRole('status')).toContainText('Site created');

  await openPages(page);
  await page.getByLabel('Page name').fill(pageName);
  await page.getByLabel('Slug').fill(pageSlug);
  await page.getByRole('button', { name: 'Create page' }).click();
  await expect(page.getByRole('status')).toContainText('draft version 1 created');
  await page.getByRole('button', { name: 'Open Builder' }).click();
  await expect(page.locator('.gjs-editor')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: /^Section/ }).click();
  await page.getByRole('button', { name: /^Text/ }).click();
  await page.getByLabel('Text content').fill('Published content A');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Saved · v2')).toBeVisible({ timeout: 15_000 });

  await returnToPages(page, `Publish Site ${suffix}`);
  await page.getByRole('button', { name: pageName }).click();
  await page.getByRole('button', { name: 'Publish draft' }).click();
  await expect(page.getByRole('status')).toContainText('Page published');

  const publicPage = await browser.newPage({ baseURL: 'http://127.0.0.1:3002' });
  const publicUrl = `/${siteSlug}/${pageSlug}`;
  await publicPage.goto(publicUrl);
  await expect(publicPage.getByText('Published content A')).toBeVisible();

  await page.getByRole('button', { name: 'Open Builder' }).click();
  await expect(page.locator('.gjs-editor')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /^Section/ }).click();
  await page.getByRole('button', { name: /^Text/ }).click();
  await page.getByLabel('Text content').fill('Draft content B');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Saved · v3')).toBeVisible({ timeout: 15_000 });

  await returnToPages(page, `Publish Site ${suffix}`);
  await page.getByRole('button', { name: pageName }).click();
  await expect(page.getByText('Newer draft', { exact: true }).first()).toBeVisible();
  await publicPage.goto(`${publicUrl}?refresh=${Date.now()}`);
  await expect(publicPage.getByText('Published content A')).toBeVisible();
  await expect(publicPage.getByText('Draft content B')).toHaveCount(0);

  await page.getByRole('button', { name: 'Publish draft' }).click();
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

test('publishes a site after its homepage is published', async ({ page }) => {
  const suffix = Date.now().toString();
  const siteName = `Site Release ${suffix}`;

  await login(page);
  await page.getByRole('button', { name: 'Sites', exact: true }).click();
  await page.getByLabel('Site name').fill(siteName);
  await page.getByLabel('Slug').fill(`site-release-${suffix}`);
  await page.getByRole('button', { name: 'Create site' }).click();
  await expect(page.getByRole('status')).toContainText('Site created');

  await page.getByRole('button', { name: 'Pages', exact: true }).click();
  await page.getByRole('button', { name: 'Select page Home at /' }).click();
  await page.getByRole('button', { name: 'Publish draft' }).click();
  await expect(page.getByRole('status')).toContainText('Page published');

  await page.getByRole('button', { name: 'Sites', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  const siteRow = page.getByRole('row').filter({ hasText: siteName });
  await siteRow.getByRole('button', { name: 'Publish site' }).click();
  await expect(page.getByRole('status')).toContainText('Site published');
  await expect(siteRow.getByRole('button', { name: 'Published' })).toBeDisabled();
});
