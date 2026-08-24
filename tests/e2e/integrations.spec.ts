import { createServer, type Server } from 'node:http';

import { expect, test, type Page } from '@playwright/test';

const email = process.env.AUTH_EMAIL ?? 'admin@example.com';
const password = process.env.AUTH_PASSWORD ?? 'change-me-in-development';

let webhookServer: Server;
const webhookRequests: Array<{
  body: string;
  headers: Record<string, string | string[] | undefined>;
}> = [];

test.beforeAll(async () => {
  webhookServer = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      webhookRequests.push({
        body: Buffer.concat(chunks).toString('utf8'),
        headers: request.headers,
      });
      response.writeHead(204).end();
    });
  });
  await new Promise<void>((resolve) => webhookServer.listen(4317, '127.0.0.1', resolve));
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    webhookServer.close((error) => (error ? reject(error) : resolve())),
  );
});

async function login(page: Page) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Good morning' })).toBeVisible();
}

test('configures integrations, binds them to a form and records deliveries', async ({
  browser,
  page,
}) => {
  const suffix = Date.now().toString();
  const siteName = `Integrations Site ${suffix}`;
  const pageName = `Integrations Page ${suffix}`;
  const siteSlug = `integrations-site-${suffix}`;
  const pageSlug = `integrations-page-${suffix}`;
  const emailIntegrationName = `Sales email ${suffix}`;
  const webhookIntegrationName = `CRM webhook ${suffix}`;

  await login(page);
  await page.getByRole('button', { name: 'Integrations', exact: true }).click();
  await page.getByLabel('Name').fill(emailIntegrationName);
  await page.getByLabel(/Recipients/).fill('sales@example.com');
  await page.getByLabel('Subject template').fill('New submission from {{pageTitle}}');
  await page.getByRole('button', { name: 'Create integration' }).click();
  await expect(page.getByRole('status')).toContainText('Integration created');

  await page.getByLabel('Type').selectOption('webhook');
  await page.getByLabel('Name').fill(webhookIntegrationName);
  await page.getByLabel('HTTPS URL').fill('http://127.0.0.1:4317/hook');
  await page.getByRole('button', { name: 'Create integration' }).click();
  await expect(page.getByRole('status')).toContainText('Integration created');

  await page.getByRole('button', { name: 'Sites', exact: true }).click();
  await page.getByLabel('Site name').fill(siteName);
  await page.getByLabel('Slug').fill(siteSlug);
  await page.getByRole('button', { name: 'Create site' }).click();
  await expect(page.getByRole('status')).toContainText('Site created');
  await page.getByRole('button', { name: 'Landing Pages', exact: true }).click();
  await page.getByLabel('Page name').fill(pageName);
  await page.getByLabel('Slug').fill(pageSlug);
  await page.getByRole('button', { name: 'Create page' }).click();
  await expect(page.getByRole('status')).toContainText('draft version 1 created');
  await page.getByRole('button', { name: 'Open Builder' }).click();
  await expect(page.locator('.gjs-editor')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /^Section/ }).click();
  await page.getByRole('button', { name: /^Form/ }).click();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Saved · v2')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '← Pages' }).click();

  await page.getByRole('button', { name: 'Landing Pages', exact: true }).click();
  await page.getByLabel('Site').selectOption({ label: siteName });
  await page.getByRole('button', { name: pageName }).click();
  await expect(page.getByRole('heading', { name: 'Form integrations' })).toBeVisible();
  const formSettings = page.locator('section[aria-label="Form integration settings"]');
  const contactForm = formSettings.locator('.form-integration-card').first();
  const emailCheckbox = contactForm.getByRole('checkbox', { name: emailIntegrationName });
  const webhookCheckbox = contactForm.getByRole('checkbox', {
    name: webhookIntegrationName,
  });
  await emailCheckbox.click();
  await expect(emailCheckbox).toBeChecked();
  await expect(page.getByRole('status')).toContainText('Form notifications updated');
  await webhookCheckbox.click();
  await expect(webhookCheckbox).toBeChecked();
  await expect(page.getByRole('status')).toContainText('Form notifications updated');
  await page.getByRole('button', { name: 'Publish draft' }).click();
  await expect(page.getByRole('status')).toContainText('Landing page published');

  const publicPage = await browser.newPage({ baseURL: 'http://127.0.0.1:3002' });
  await publicPage.goto(`/${siteSlug}/${pageSlug}`);
  await publicPage.getByLabel('Name').fill('Integration visitor');
  await publicPage.getByLabel('Email').fill('visitor@example.com');
  await publicPage.getByRole('button', { name: 'Submit' }).click();
  await expect(publicPage.getByRole('status')).toContainText('Thanks');

  await page.getByRole('button', { name: 'Integrations', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Delivery logs' })).toBeVisible();
  await expect
    .poll(async () => {
      await page.getByRole('button', { name: 'Refresh' }).click();
      return await page
        .locator('.list-row')
        .filter({ hasText: emailIntegrationName })
        .count();
    })
    .toBeGreaterThan(0);
  await expect(
    page
      .locator('.list-row')
      .filter({ hasText: emailIntegrationName })
      .getByText('delivered'),
  ).toBeVisible();
  await expect(
    page
      .locator('.list-row')
      .filter({ hasText: webhookIntegrationName })
      .getByText('delivered'),
  ).toBeVisible();
  expect(webhookRequests).toHaveLength(1);
  expect(webhookRequests[0]?.headers['x-payload-event']).toBe('form.submitted');
  expect(JSON.parse(webhookRequests[0]!.body)).toMatchObject({
    event: 'form.submitted',
    version: 1,
    data: { name: 'Integration visitor' },
  });
});
