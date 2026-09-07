import { test, expect, type Page } from './fixtures/canonical-environment';

const apiBase = process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';
const email = process.env.AUTH_EMAIL ?? 'admin@example.com';
const password = process.env.AUTH_PASSWORD ?? 'change-me-in-development';

type BuilderNode = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  style?: Record<string, Record<string, unknown>>;
  children: BuilderNode[];
};

async function openCanonicalBuilder(
  page: Page,
  environment: {
    organizationId: string;
    workspaceId: string;
    siteId: string;
    pageId: string;
  },
): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/workspaces\/[^/]+$/);

  const context = await page.request.post(`${apiBase}/auth/context`, {
    data: {
      organizationId: environment.organizationId,
      workspaceId: environment.workspaceId,
    },
  });
  expect(context.ok()).toBeTruthy();

  await page.goto(
    `/workspaces/${environment.workspaceId}/sites/${environment.siteId}/pages/${environment.pageId}/builder`,
  );
  await expect(page.locator('.builder-editor-host iframe.gjs-frame')).toBeAttached({
    timeout: 15_000,
  });
}

async function readRoot(page: Page): Promise<BuilderNode> {
  const payload = await page.evaluate(() => {
    const debug = (
      window as Window & { __payloadBuilderDebug?: { getPayload: () => unknown } }
    ).__payloadBuilderDebug;
    return debug?.getPayload();
  });
  expect(payload).toBeTruthy();
  return (payload as { root: BuilderNode }).root;
}

function findNode(root: BuilderNode, type: string): BuilderNode | undefined {
  if (root.type === type) return root;
  for (const child of root.children) {
    const result = findNode(child, type);
    if (result) return result;
  }
  return undefined;
}

test('keeps partial URL drafts local and navigates to the exact invalid field', async ({
  page,
  canonicalEnvironment,
}) => {
  test.setTimeout(120_000);
  await openCanonicalBuilder(page, canonicalEnvironment);
  await page.getByRole('button', { name: 'Button add', exact: true }).click();
  const canvas = page.frameLocator('iframe.gjs-frame');
  await canvas.locator('a[data-payload-node-type="button"]').click();

  const destinationType = page.getByLabel('Link destination type', { exact: true });
  await destinationType.selectOption('external');
  const website = page.getByLabel('Link website', { exact: true });
  await website.fill('https://');
  await expect(website).toHaveValue('https://');
  await expect(page.locator('.builder-alert')).toHaveCount(0);
  await expect(website).not.toHaveAttribute('aria-invalid', 'true');
  expect(findNode(await readRoot(page), 'button')?.props.href).toBe('#section');

  await website.blur();
  await expect(website).toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('1 issue need attention', { exact: true })).toBeVisible();
  const field = page.locator('[data-builder-field="href"]').first();
  await expect(field).toHaveClass(/builder-validation-field-invalid/);
  await expect(field).toHaveClass(/builder-validation-flash/);
  const errorId = await website.getAttribute('aria-describedby');
  expect(errorId).toBeTruthy();
  await expect(page.locator(`#${errorId}`)).toHaveText('Enter a valid, safe URL.');

  await website.fill('example.org');
  await website.blur();
  await expect(website).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('[data-builder-validation-summary]')).toHaveCount(0);
  await expect
    .poll(async () => findNode(await readRoot(page), 'button')?.props.href)
    .toBe('https://example.org');
});

test('keeps invalid number and color drafts out of the document', async ({
  page,
  canonicalEnvironment,
}) => {
  test.setTimeout(120_000);
  await openCanonicalBuilder(page, canonicalEnvironment);
  await page.getByRole('button', { name: 'Button add', exact: true }).click();
  const canvas = page.frameLocator('iframe.gjs-frame');
  await canvas.locator('a[data-payload-node-type="button"]').click();
  await page.getByRole('tab', { name: 'Style', exact: true }).click();

  await page.getByText('Effects', { exact: true }).click();
  const opacity = page.getByLabel('Opacity', { exact: true });
  await opacity.fill('1.5');
  await expect(opacity).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('.builder-alert')).toHaveCount(0);
  expect(findNode(await readRoot(page), 'button')?.style?.base?.opacity).toBeUndefined();

  await opacity.blur();
  await expect(opacity).not.toHaveAttribute('aria-invalid', 'true');
  expect(findNode(await readRoot(page), 'button')?.style?.base?.opacity).toBe('1');

  await page.locator('summary').filter({ hasText: 'Background' }).click();
  const color = page.getByLabel('Background hex value', { exact: true });
  await color.fill('#12');
  await expect(color).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('.builder-alert')).toHaveCount(0);
  await color.blur();
  await expect(color).toHaveAttribute('aria-invalid', 'true');
  await color.fill('#112233');
  await expect(color).not.toHaveAttribute('aria-invalid', 'true');
});

test('uses semantic layout choices and hides irrelevant controls', async ({
  page,
  canonicalEnvironment,
}) => {
  test.setTimeout(120_000);
  await openCanonicalBuilder(page, canonicalEnvironment);
  await page.getByRole('button', { name: 'Section add', exact: true }).click();
  await page
    .frameLocator('iframe.gjs-frame')
    .locator('section[data-payload-node-type="section"]')
    .first()
    .click();
  await page.getByRole('tab', { name: 'Style', exact: true }).click();

  const layout = page.getByLabel('Layout', { exact: true });
  await layout.selectOption('grid');
  await expect(page.getByLabel('Grid columns', { exact: true })).toBeVisible();
  await expect(page.getByText('Direction', { exact: true })).toHaveCount(0);

  await layout.selectOption('stack');
  await expect(page.getByText('Direction', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Grid columns', { exact: true })).toHaveCount(0);
  expect(findNode(await readRoot(page), 'section')?.style?.base).toMatchObject({
    display: 'flex',
    flexDirection: 'column',
  });
});
