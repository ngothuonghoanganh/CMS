import { expect, test, type Page } from '@playwright/test';

const email = process.env.AUTH_EMAIL ?? 'admin@example.com';
const password = process.env.AUTH_PASSWORD ?? 'change-me-in-development';

type BuilderNode = {
  id: string;
  type: string;
  children: BuilderNode[];
};

async function openBuilder(page: Page): Promise<void> {
  const suffix = Date.now().toString();
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('button', { name: 'Sites', exact: true }).click();
  await page.getByLabel('Site name').fill(`Phase 17.1 Site ${suffix}`);
  await page.getByLabel('Slug').fill(`phase-17-1-${suffix}`);
  await page.getByRole('button', { name: 'Create site' }).click();
  await expect(page.getByRole('status')).toContainText('Site created');
  await page.getByRole('button', { name: 'Pages', exact: true }).click();
  await page.getByLabel('Page name').fill(`Phase 17.1 Page ${suffix}`);
  await page.getByLabel('Slug').fill(`phase-17-1-page-${suffix}`);
  await page.getByRole('button', { name: 'Create page' }).click();
  await expect(page.getByRole('status')).toContainText('draft version 1 created');
  await page.getByRole('button', { name: 'Open Builder' }).click();
  await expect(page.locator('.gjs-editor')).toBeVisible({ timeout: 15_000 });
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

function collectIds(node: BuilderNode): string[] {
  return [node.id, ...node.children.flatMap((child) => collectIds(child))];
}

test('Phase 17.1 keeps compound duplicate identity and global preset roots canonical', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openBuilder(page);

  await expect(
    page.getByRole('img', { name: 'Button preview', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Add a button block to your page.', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Search components').fill('navigation');
  await expect(page.getByRole('button', { name: 'Button add', exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText('No matching components.', { exact: true })).toBeVisible();

  await page.getByLabel('Search components').fill('');
  await page.getByRole('button', { name: 'Hero add', exact: true }).click();
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await page
    .getByRole('treeitem', { name: 'Select Section', exact: true })
    .first()
    .click();
  await expect(
    page.getByRole('button', { name: 'Clone selected element', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Clone selected element', exact: true }).click();

  let root = await readRoot(page);
  let ids = collectIds(root);
  expect(root.children).toHaveLength(2);
  expect(new Set(ids).size).toBe(ids.length);
  expect(root.children[0]?.id).not.toBe(root.children[1]?.id);
  expect(root.children[0]?.children[0]?.children[0]?.id).not.toBe(
    root.children[1]?.children[0]?.children[0]?.id,
  );

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await readRoot(page)).children).toHaveLength(1);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect((await readRoot(page)).children).toHaveLength(2);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText(/Saved · v2/, { exact: true })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByLabel('Editing document').selectOption('site-header');
  await page.getByRole('button', { name: 'Add blocks', exact: true }).click();
  await expect(
    page.locator('.builder-block-preview[data-preview-variant="global-header"]').first(),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Brand · Menu · CTA add', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Brand · Menu · CTA add', exact: true }).click();
  root = await readRoot(page);
  expect(root.children).toHaveLength(1);
  expect(root.children[0]?.type).toBe('global-header');
  ids = collectIds(root);
  expect(new Set(ids).size).toBe(ids.length);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Brand · Menu add', exact: true }).click();
  root = await readRoot(page);
  expect(root.children).toHaveLength(1);
  expect(root.children[0]?.type).toBe('global-header');
  expect(root.children[0]?.children).toHaveLength(2);
  ids = collectIds(root);
  expect(new Set(ids).size).toBe(ids.length);
});
