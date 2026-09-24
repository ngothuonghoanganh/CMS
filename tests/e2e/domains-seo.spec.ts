import { expect } from '@playwright/test';
import {
  canonicalEnvironmentNames,
  createTemporaryPage,
  loginToCanonicalBuilder,
  switchCanonicalBrowserContext,
  test,
} from './fixtures/canonical-environment';
import { E2E_RENDERER_ORIGIN } from './fixtures/urls';

async function openSitePages(page: import('@playwright/test').Page, siteName: string) {
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: 'Websites', exact: true })
    .click();
  await page
    .locator('tr.site-table-row')
    .filter({ hasText: siteName })
    .getByRole('link')
    .first()
    .click();
  await page
    .locator('.site-context-nav')
    .getByRole('link', { name: 'Pages', exact: true })
    .click();
}

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
  await openSitePages(page, canonicalEnvironmentNames.siteName);
  await page.getByRole('button', { name: /__e2e__ phase-seo/ }).click();

  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: 'Settings', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Settings', exact: true }),
  ).toBeVisible();
  await page.locator('.settings-link-card').filter({ hasText: 'SEO' }).click();
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

  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: 'Settings', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Settings', exact: true }),
  ).toBeVisible();
  await page.locator('.settings-link-card').filter({ hasText: 'Domains' }).click();
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

  await openSitePages(page, canonicalEnvironmentNames.siteName);
  await page.getByRole('button', { name: pageName }).click();
  await page.getByRole('button', { name: 'Publish draft' }).click();
  await page.getByRole('button', { name: 'Publish version' }).click();
  await expect(page.getByRole('status')).toContainText('Page published');

  const publicPage = await browser.newPage({ baseURL: E2E_RENDERER_ORIGIN });
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
