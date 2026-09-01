import { expect } from '@playwright/test';
import {
  canonicalEnvironmentNames,
  openCanonicalBuilder,
  test,
} from './fixtures/canonical-environment';

test('tracks a public page view, CTA click and form conversion in CMS Analytics', async ({
  browser,
  page,
  request,
  canonicalEnvironment,
}) => {
  const suffix = Date.now().toString();
  const temporaryPage = await openCanonicalBuilder(
    page,
    request,
    canonicalEnvironment,
    'phase-analytics',
  );
  const siteName = canonicalEnvironmentNames.siteName;
  const siteSlug = temporaryPage.siteSlug;
  const pageName = temporaryPage.name;
  const pageSlug = temporaryPage.slug;
  await page.getByRole('button', { name: /^Section/ }).click();
  await page.getByRole('button', { name: /^Button/ }).click();
  await page.getByRole('button', { name: /^Form/ }).click();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Saved · v2')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '← Pages' }).click();
  await page.getByRole('button', { name: 'Pages', exact: true }).click();
  await page
    .getByLabel('Site')
    .selectOption({ label: canonicalEnvironmentNames.siteName });
  await page.getByRole('button', { name: pageName }).click();
  await page.getByRole('button', { name: 'Publish draft' }).click();
  await expect(page.getByRole('status')).toContainText('Page published');

  const publicPage = await browser.newPage({ baseURL: 'http://127.0.0.1:3002' });
  await publicPage.goto(
    `/${siteSlug}/${pageSlug}?utm_source=e2e&utm_medium=test&utm_campaign=analytics`,
  );
  await expect(publicPage.locator('a[data-payload-node-type="button"]')).toBeVisible();
  await expect(publicPage.getByLabel('Name')).toBeVisible();
  await publicPage.evaluate(() => {
    const button = document.querySelector<HTMLAnchorElement>(
      'a[data-payload-node-type="button"]',
    );
    if (!button) throw new Error('CTA button not rendered');
    button.addEventListener('click', (event) => event.preventDefault(), { once: true });
    button.click();
  });
  await publicPage.getByLabel('Name').fill('Analytics visitor');
  await publicPage.getByLabel('Email').fill(`analytics-${suffix}@example.com`);
  await publicPage.getByRole('button', { name: 'Submit' }).click();
  await expect(publicPage.getByRole('status')).toContainText('Thanks');
  await publicPage.close();

  await page.getByRole('button', { name: 'Analytics', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
  await expect(
    page.locator('.analytics-metric-card').nth(0).locator('strong'),
  ).toHaveText(/[1-9]/, { timeout: 15_000 });
  await expect(
    page.locator('.analytics-metric-card').nth(2).locator('strong'),
  ).toHaveText(/[1-9]/);
  await expect(page.getByText('Top pages')).toBeVisible();
});
