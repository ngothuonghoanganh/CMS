import { expect, test, type Page } from '@playwright/test';

const email = process.env.AUTH_EMAIL ?? 'admin@example.com';
const password = process.env.AUTH_PASSWORD ?? 'change-me-in-development';

type BuilderNode = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  style?: Record<string, unknown>;
  children: BuilderNode[];
};

async function openBuilder(page: Page, prefix: string): Promise<void> {
  const suffix = Date.now().toString();
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('button', { name: 'Sites', exact: true }).click();
  await page.getByLabel('Site name').fill(`${prefix} Site ${suffix}`);
  await page
    .getByLabel('Slug')
    .fill(`${prefix.toLowerCase().replaceAll(' ', '-')}-${suffix}`);
  await page.getByRole('button', { name: 'Create site' }).click();
  await expect(page.getByRole('status')).toContainText('Site created');
  await page.getByRole('button', { name: 'Pages', exact: true }).click();
  await page.getByLabel('Page name').fill(`${prefix} Page ${suffix}`);
  await page
    .getByLabel('Slug')
    .fill(`${prefix.toLowerCase().replaceAll(' ', '-')}-page-${suffix}`);
  await page.getByRole('button', { name: 'Create page' }).click();
  await expect(page.getByRole('status')).toContainText('draft version 1 created');
  await page.getByRole('button', { name: 'Open Builder' }).click();
  await expect(page.locator('.gjs-editor')).toBeVisible({ timeout: 15_000 });
}

async function readBuilderModel(page: Page): Promise<BuilderNode> {
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

function collectIds(root: BuilderNode): string[] {
  return [root.id, ...root.children.flatMap(collectIds)];
}

test('Phase 15 preset and semantic components stay synchronized through save/reload', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openBuilder(page, 'Phase 15 Components');
  const canvas = page.frameLocator('iframe.gjs-frame');

  await page.getByRole('button', { name: 'Hero add' }).click();
  const initialRoot = await readBuilderModel(page);
  const initialIds = collectIds(initialRoot);
  expect(new Set(initialIds).size).toBe(initialIds.length);
  expect(initialRoot.children[0]?.type).toBe('section');
  expect(findNode(initialRoot, 'heading')?.type).toBe('heading');
  expect(findNode(initialRoot, 'text')?.type).toBe('text');
  expect(findNode(initialRoot, 'button')?.type).toBe('button');

  await canvas.locator('h2[data-payload-node-type="heading"]').click();
  await page.getByLabel('Text content').fill('A platform heading');
  await page.getByLabel('Heading level').selectOption('1');
  await expect(canvas.locator('h1[data-payload-node-type="heading"]')).toHaveText(
    'A platform heading',
  );

  await page.getByRole('tab', { name: 'Style', exact: true }).click();
  await page.getByText('Typography', { exact: true }).click();
  await page.getByLabel('Font size', { exact: true }).fill('48');
  await page.getByRole('button', { name: 'Tablet', exact: true }).click();
  await expect(page.getByLabel('Font size', { exact: true })).toHaveValue('48');
  await page.getByLabel('Font size', { exact: true }).fill('36');
  await page.getByRole('button', { name: 'Mobile', exact: true }).click();
  await expect(page.getByLabel('Font size', { exact: true })).toHaveValue('36');
  await page.getByLabel('Font size', { exact: true }).fill('28');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByLabel('Font size', { exact: true })).toHaveValue('36');
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.getByLabel('Font size', { exact: true })).toHaveValue('28');

  await page.getByRole('button', { name: 'Link add' }).click();
  const link = canvas.locator('a[data-payload-node-type="link"]');
  await link.click();
  await page.getByRole('tab', { name: 'Content', exact: true }).click();
  await page.getByLabel('Text', { exact: true }).fill('Read the docs');
  await page.getByLabel('Link', { exact: true }).fill('/docs');
  await expect(link).toHaveAttribute('href', '/docs');

  await page.getByRole('button', { name: 'Divider add' }).click();
  await page.getByRole('tab', { name: 'Style', exact: true }).click();
  await page.getByLabel('Width', { exact: true }).fill('80');

  await page.getByRole('button', { name: 'Video add' }).click();
  const video = canvas.locator('video[data-payload-node-type="video"]');
  await expect(video).toHaveCount(1);
  // Media without a loaded source can have no clickable canvas surface. Use
  // the builder's Layers selection, the supported path for non-visible nodes.
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await page.getByRole('treeitem', { name: 'Select Video', exact: true }).click();
  await page.getByRole('tab', { name: 'Content', exact: true }).click();
  await page.getByLabel('Video source URL', { exact: true }).fill('/assets/demo.mp4');
  // The controlled inspector remounts this checkbox after dispatching the
  // command. Force the user-equivalent click through that brief rerender.
  await page.getByLabel('Autoplay', { exact: true }).click({ force: true });
  await expect(page.getByLabel('Muted', { exact: true })).toBeChecked();

  const beforeSave = await page.evaluate(() => {
    const debug = (
      window as Window & { __payloadBuilderDebug?: { getPayload: () => unknown } }
    ).__payloadBuilderDebug;
    return debug?.getPayload();
  });
  expect(beforeSave).toMatchObject({ version: 4 });
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Saved · v2')).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await expect(canvas.locator('h1[data-payload-node-type="heading"]')).toHaveText(
    'A platform heading',
    { timeout: 15_000 },
  );
  await expect(
    canvas
      .locator('a[data-payload-node-type="link"]')
      .filter({ hasText: 'Read the docs' }),
  ).toHaveAttribute('href', '/docs');
  await expect(canvas.locator('hr[data-payload-node-type="divider"]')).toHaveCount(1);
  await expect(video).toHaveAttribute('src', '/assets/demo.mp4');
  const reloaded = await page.evaluate(() => {
    const debug = (
      window as Window & { __payloadBuilderDebug?: { getPayload: () => unknown } }
    ).__payloadBuilderDebug;
    return debug?.getPayload();
  });
  expect(reloaded).toMatchObject({ version: 4 });
  const heading = findNode((reloaded as { root: BuilderNode }).root, 'heading');
  expect(heading?.props).toMatchObject({ text: 'A platform heading', level: 1 });
  expect(heading?.style).toMatchObject({
    base: { fontSize: '48px' },
    tablet: { fontSize: '36px' },
    mobile: { fontSize: '28px' },
  });
});

test('Phase 15 list editor supports stable item operations with undo/redo and reload', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openBuilder(page, 'Phase 15 List');
  const canvas = page.frameLocator('iframe.gjs-frame');
  await page.getByRole('button', { name: 'Hero add' }).click();
  await page.getByRole('button', { name: 'List add' }).click();

  await page.getByLabel('Ordered list', { exact: true }).check();
  await expect(canvas.locator('ol[data-payload-node-type="list"]')).toHaveCount(1);
  await page.getByRole('button', { name: '+ Add item', exact: true }).click();
  await page.getByLabel('Item 3', { exact: true }).fill('Third item');
  await page.getByRole('button', { name: 'Move item 3 up', exact: true }).click();
  let list = findNode(await readBuilderModel(page), 'list');
  expect(list?.props.items).toEqual([
    { id: 'item-1', text: 'First item' },
    { id: expect.any(String), text: 'Third item' },
    { id: 'item-2', text: 'Second item' },
  ]);

  await page.getByRole('button', { name: 'Remove item 2', exact: true }).click();
  list = findNode(await readBuilderModel(page), 'list');
  expect(list?.props.items).toHaveLength(2);
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(findNode(await readBuilderModel(page), 'list')?.props.items).toHaveLength(3);
  await page.getByRole('button', { name: 'Redo' }).click();
  expect(findNode(await readBuilderModel(page), 'list')?.props.items).toHaveLength(2);

  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Saved · v2')).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(canvas.locator('ol[data-payload-node-type="list"]')).toHaveCount(1);
  await expect(canvas.locator('ol[data-payload-node-type="list"] li')).toHaveCount(2);
  expect(findNode(await readBuilderModel(page), 'list')?.props.items).toHaveLength(2);
});
