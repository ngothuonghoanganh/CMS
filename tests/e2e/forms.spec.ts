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
  if (siteName) await page.getByLabel('Site').selectOption({ label: siteName });
}

test('builds, publishes, submits and manages a form with published-schema isolation', async ({
  browser,
  page,
}) => {
  const suffix = Date.now().toString();
  const siteName = `Forms Site ${suffix}`;
  const siteSlug = `forms-site-${suffix}`;
  const pageName = `Forms Page ${suffix}`;
  const pageSlug = `forms-page-${suffix}`;

  await login(page);
  await page.getByRole('button', { name: 'Sites', exact: true }).click();
  await page.getByLabel('Site name').fill(siteName);
  await page.getByLabel('Slug').fill(siteSlug);
  await page.getByRole('button', { name: 'Create site' }).click();
  await expect(page.getByRole('status')).toContainText('Site created');

  await openPages(page);
  await page.getByLabel('Page name').fill(pageName);
  await page.getByLabel('Slug').fill(pageSlug);
  await page.getByRole('button', { name: 'Create page' }).click();
  await page.getByRole('button', { name: 'Open Builder' }).click();
  await expect(page.locator('.gjs-editor')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: /^Section/ }).click();
  await page.getByRole('button', { name: /^Form/ }).click();
  await expect(page.getByLabel('Form field label name')).toHaveValue('Name');
  await expect(page.getByLabel('Form field label email')).toHaveValue('Email');
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await expect(
    page.locator('.builder-layer-button[aria-label="Select Form"]'),
  ).toBeVisible();

  const canvas = page.frameLocator('.gjs-frame');
  await expect(canvas.locator('form[data-payload-node-type="form"]')).toBeVisible();
  await expect(
    canvas.locator('form[data-payload-node-type="form"] input[name="name"]'),
  ).toBeVisible();
  await expect(
    canvas.locator('form[data-payload-node-type="form"] input[name="email"]'),
  ).toBeVisible();
  await expect(
    canvas.locator('form[data-payload-node-type="form"] button[type="button"]'),
  ).toHaveText('Submit');

  const draftPayload = await page.evaluate(() => {
    const debug = (
      window as unknown as {
        __payloadBuilderDebug?: { getPayload: () => unknown };
      }
    ).__payloadBuilderDebug;
    const payload = debug?.getPayload() as
      { root?: { type?: string; children?: unknown[] } } | undefined;
    const pending = payload?.root ? [payload.root] : [];
    while (pending.length > 0) {
      const node = pending.shift() as { type?: string; children?: unknown[] };
      if (node.type === 'form') return node;
      for (const child of node.children ?? []) {
        pending.push(child as { type?: string; children?: unknown[] });
      }
    }
    return undefined;
  });
  expect(draftPayload).toMatchObject({
    type: 'form',
    props: {
      fields: [
        { id: 'name', label: 'Name' },
        { id: 'email', label: 'Email' },
      ],
    },
  });

  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Saved · v2')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: '← Pages' }).click();
  await openPages(page, siteName);
  await page.getByRole('button', { name: pageName }).click();
  await page.getByRole('button', { name: 'Open Builder' }).click();
  await expect(page.locator('.gjs-editor')).toBeVisible({ timeout: 15_000 });
  const reloadedCanvas = page.frameLocator('.gjs-frame');
  await expect(
    reloadedCanvas.locator('form[data-payload-node-type="form"]'),
  ).toBeVisible();
  await expect(reloadedCanvas.locator('input[name="name"]')).toBeVisible();
  await expect(reloadedCanvas.locator('input[name="email"]')).toBeVisible();
  await page.getByRole('button', { name: '← Pages' }).click();
  await openPages(page, siteName);
  await page.getByRole('button', { name: pageName }).click();
  await page.getByRole('button', { name: 'Publish draft' }).click();
  await expect(page.getByRole('status')).toContainText('Page published');

  const publicPage = await browser.newPage({ baseURL: 'http://127.0.0.1:3002' });
  await publicPage.goto(`/${siteSlug}/${pageSlug}`);
  await publicPage.getByLabel('Name').fill('Jane Visitor');
  await publicPage.getByLabel('Email').fill('jane.e2e@example.com');
  await publicPage.getByRole('button', { name: 'Submit' }).click();
  await expect(publicPage.getByRole('status')).toContainText('Thanks');

  await page.getByRole('button', { name: 'Open Builder' }).click();
  await expect(page.locator('.gjs-editor')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await page.locator('.builder-layer-button[aria-label^="Select Form"]').click();
  await page.getByLabel('Form field type email').selectOption('phone');
  await page.getByLabel('Form field label email').fill('Phone');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Saved · v3')).toBeVisible({ timeout: 15_000 });

  await publicPage.goto(`/${siteSlug}/${pageSlug}?draft-check=${Date.now()}`);
  await expect(publicPage.getByLabel('Email')).toBeVisible();
  await expect(publicPage.getByLabel('Phone')).toHaveCount(0);

  await page.getByRole('button', { name: '← Pages' }).click();
  await openPages(page, siteName);
  await page.getByRole('button', { name: pageName }).click();
  await page.getByRole('button', { name: 'Publish draft' }).click();
  await expect(page.getByRole('status')).toContainText('Page published');

  await publicPage.goto(`/${siteSlug}/${pageSlug}?republished=${Date.now()}`);
  await expect(publicPage.getByLabel('Phone')).toBeVisible();
  await expect(publicPage.getByLabel('Email')).toHaveCount(0);

  await page.getByRole('button', { name: 'Submissions', exact: true }).click();
  await expect(page.getByText('jane.e2e@example.com').first()).toBeVisible({
    timeout: 15_000,
  });
  await page
    .getByRole('button', { name: new RegExp(`jane\\.e2e@example\\.com.*${pageName}`) })
    .click();
  await expect(page.getByRole('dialog', { name: pageName })).toContainText(
    'Jane Visitor',
  );

  await publicPage.close();
});
