import { expect } from '@playwright/test';
import {
  canonicalEnvironmentNames,
  createTemporaryPage,
  loginToCanonicalBuilder,
  switchCanonicalBrowserContext,
  test,
} from './fixtures/canonical-environment';

test('configures SEO, verifies a custom domain and renders its public metadata', async ({
  browser,
  page,
  request,
  canonicalEnvironment,
}) => {
  const hostname = 'e2e-seo.example.com';
  const temporaryPage = await createTemporaryPage(
    request,
    canonicalEnvironment,
    'phase-seo',
  );
  const siteSlug = canonicalEnvironment.siteSlug;
  const pageName = temporaryPage.name;
  const pageSlug = temporaryPage.slug;

  await loginToCanonicalBuilder(page);
  await switchCanonicalBrowserContext(page, canonicalEnvironment);
  await page.getByRole('button', { name: 'Pages', exact: true }).click();
  await page
    .getByLabel('Site')
    .selectOption({ label: canonicalEnvironmentNames.siteName });
  await page.getByRole('button', { name: /__e2e__ phase-seo/ }).click();

  await page.getByRole('button', { name: 'SEO', exact: true }).click();
  await page.getByRole('combobox', { name: 'Page', exact: true }).selectOption({
    label: pageName,
  });
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
  await page.getByRole('button', { name: 'Add domain', exact: true }).first().click();
  await page.getByLabel('Hostname').fill(hostname);
  await page
    .getByRole('combobox', { name: 'Page', exact: true })
    .selectOption({ label: `${pageName} (/${pageSlug})` });
  await page.getByLabel('Use as the canonical primary domain for this page').check();
  await page.getByRole('button', { name: 'Add domain', exact: true }).last().click();
  await expect(page.getByRole('status')).toContainText('Domain added');
  const domainRow = page.locator(`[data-domain-hostname="${hostname}"]`);
  await domainRow.getByRole('button', { name: 'Verify / retry' }).click();
  await expect(domainRow.getByText('active', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Pages', exact: true }).click();
  await page
    .getByLabel('Site')
    .selectOption({ label: canonicalEnvironmentNames.siteName });
  await page.getByRole('button', { name: pageName }).click();
  await page.getByRole('button', { name: 'Publish draft' }).click();
  await expect(page.getByRole('status')).toContainText('Page published');

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
