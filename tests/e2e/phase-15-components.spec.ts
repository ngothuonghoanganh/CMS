import { expect, type Page } from '@playwright/test';
import { openCanonicalBuilder, test } from './fixtures/canonical-environment';

type BuilderNode = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  style?: Record<string, unknown>;
  children: BuilderNode[];
};

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
  request,
  canonicalEnvironment,
}) => {
  test.setTimeout(120_000);
  await openCanonicalBuilder(page, request, canonicalEnvironment, 'phase-15-components');
  const canvas = page.frameLocator('iframe.gjs-frame');

  await page.getByRole('button', { name: 'Hero add' }).click();
  const initialRoot = await readBuilderModel(page);
  const initialIds = collectIds(initialRoot);
  expect(new Set(initialIds).size).toBe(initialIds.length);
  expect(initialRoot.children[0]?.type).toBe('section');
  expect(findNode(initialRoot, 'heading')?.type).toBe('heading');
  expect(findNode(initialRoot, 'text')?.type).toBe('text');
  expect(findNode(initialRoot, 'button')?.type).toBe('button');

  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  const headingLayer = page.getByRole('treeitem', {
    name: 'Select Heading',
    exact: true,
  });
  await headingLayer.click();
  await expect(headingLayer).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.builder-properties-panel strong').first()).toHaveText(
    'Heading',
  );
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

  await page.getByRole('button', { name: 'Add blocks', exact: true }).click();
  await page.getByRole('button', { name: 'Link add' }).click();
  const link = canvas.locator('a[data-payload-node-type="link"]');
  // Select through Layers so the inspector remains attached while the canvas
  // rerenders after the component is inserted.
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  const linkLayer = page.getByRole('treeitem', { name: 'Select Link', exact: true });
  await linkLayer.click();
  await expect(linkLayer).toHaveAttribute('aria-selected', 'true');
  const selectedInspectorNode = page.locator('.builder-properties-panel strong').first();
  await expect(selectedInspectorNode).toHaveText('Link', { timeout: 5_000 });
  await page.getByRole('tab', { name: 'Content', exact: true }).click();
  await expect(selectedInspectorNode).toHaveText('Link', { timeout: 5_000 });
  await page.getByLabel('Text', { exact: true }).fill('Read the docs');
  await page.getByLabel('Link', { exact: true }).fill('/docs');
  await page.getByLabel('Link', { exact: true }).press('Enter');
  await expect(link).toHaveAttribute('href', '/docs');

  await page.getByRole('button', { name: 'Add blocks', exact: true }).click();
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
  request,
  canonicalEnvironment,
}) => {
  test.setTimeout(120_000);
  await openCanonicalBuilder(page, request, canonicalEnvironment, 'phase-15-list');
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
