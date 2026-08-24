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

test('configures SEO, verifies a custom domain and renders its public metadata', async ({
  browser,
  page,
}) => {
  const suffix = Date.now().toString();
  const siteName = `SEO Site ${suffix}`;
  const siteSlug = `seo-site-${suffix}`;
  const pageName = `SEO Page ${suffix}`;
  const pageSlug = `seo-page-${suffix}`;
  const hostname = `seo-${suffix}.example.com`;

  await login(page);
  await page.getByRole('button', { name: 'Sites', exact: true }).click();
  await page.getByLabel('Site name').fill(siteName);
  await page.getByLabel('Slug').fill(siteSlug);
  await page.getByRole('button', { name: 'Create site' }).click();
  await expect(page.getByRole('status')).toContainText('Site created');

  await page.getByRole('button', { name: 'Landing Pages', exact: true }).click();
  await page.getByLabel('Site').selectOption({ label: siteName });
  await page.getByLabel('Page name').fill(pageName);
  await page.getByLabel('Slug').fill(pageSlug);
  await page.getByRole('button', { name: 'Create page' }).click();
  await expect(page.getByRole('status')).toContainText('draft version 1 created');

  await page.getByRole('button', { name: 'SEO', exact: true }).click();
  await page.getByLabel('Landing page').selectOption({ label: pageName });
  await page.getByLabel('SEO title').fill('Custom domain SEO title');
  await page.getByLabel('Meta description').fill('Custom domain SEO description');
  await page.getByLabel('Canonical URL').fill(`https://${hostname}/`);
  const seoResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/pages/') &&
      response.url().endsWith('/seo') &&
      response.request().method() === 'PATCH',
  );
  await page.getByRole('button', { name: 'Save SEO settings' }).click();
  const seoResponse = await seoResponsePromise;
  expect(seoResponse.ok()).toBe(true);
  await expect(page.getByRole('status')).toContainText('SEO settings saved');

  await page.getByRole('button', { name: 'Domains', exact: true }).click();
  await page.getByLabel('Hostname').fill(hostname);
  await page
    .getByLabel('Landing page')
    .selectOption({ label: `${pageName} (/${pageSlug})` });
  await page.getByLabel('Use as the canonical primary domain for this page').check();
  await page.getByRole('button', { name: 'Add domain' }).click();
  await expect(page.getByRole('status')).toContainText('Domain added');
  const domainRow = page.locator(`[data-domain-hostname="${hostname}"]`);
  await domainRow.getByRole('button', { name: 'Verify / retry' }).click();
  await expect(domainRow.getByText('active', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Landing Pages', exact: true }).click();
  await page.getByLabel('Site').selectOption({ label: siteName });
  await page.getByRole('button', { name: pageName }).click();
  await page.getByRole('button', { name: 'Publish draft' }).click();
  await expect(page.getByRole('status')).toContainText('Landing page published');

  const publicPage = await browser.newPage({ baseURL: 'http://127.0.0.1:3002' });
  await publicPage.setExtraHTTPHeaders({ 'x-forwarded-host': hostname });
  await publicPage.goto('/');
  await expect(publicPage.locator('.public-page')).toBeVisible();
  await expect(publicPage).toHaveTitle('Custom domain SEO title');
  await expect(publicPage.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    'Custom domain SEO description',
  );
  await expect(publicPage.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    `https://${hostname}/`,
  );

  const robotsResponse = await publicPage.goto('/robots.txt');
  expect(await robotsResponse?.text()).toContain(
    `Sitemap: https://${hostname}/sitemap.xml`,
  );
  const sitemapResponse = await publicPage.goto('/sitemap.xml');
  expect(await sitemapResponse?.text()).toContain(`https://${hostname}/`);
  await publicPage.close();
});
