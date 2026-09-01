import { expect } from '@playwright/test';
import { openCanonicalBuilder, test } from './fixtures/canonical-environment';

type BuilderNode = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  style?: Record<string, Record<string, string>>;
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

function findNodes(root: BuilderNode, type: string): BuilderNode[] {
  return [
    ...(root.type === type ? [root] : []),
    ...root.children.flatMap((child) => findNodes(child, type)),
  ];
}

test('Phase 16 compound structures edit through Layers, Inspector, commands, and reload', async ({
  page,
  request,
  canonicalEnvironment,
}) => {
  test.setTimeout(120_000);
  await openCanonicalBuilder(page, request, canonicalEnvironment, 'phase-16-accordion');
  const canvas = page.frameLocator('iframe.gjs-frame');

  await page.getByRole('button', { name: 'Accordion add', exact: true }).click();
  let root = await readBuilderModel(page);
  expect(findNode(root, 'accordion')?.children).toHaveLength(2);
  expect(
    page.getByRole('button', { name: 'Accordion Item add', exact: true }),
  ).toHaveCount(0);

  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await page
    .getByRole('treeitem', { name: 'Select Accordion Item', exact: true })
    .first()
    .click();
  await page.getByLabel('Title', { exact: true }).fill('Renamed details');
  await page.getByRole('button', { name: 'Add blocks', exact: true }).click();
  await page.getByRole('button', { name: 'Heading add', exact: true }).click();

  root = await readBuilderModel(page);
  expect(findNode(root, 'accordion')?.children[0]?.props).toMatchObject({
    title: 'Renamed details',
  });
  expect(findNode(root, 'heading')?.props).toMatchObject({ text: 'Heading' });

  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await page.getByRole('treeitem', { name: 'Select Accordion', exact: true }).click();
  await page.getByRole('button', { name: '+ Add Accordion Item', exact: true }).click();
  root = await readBuilderModel(page);
  expect(findNode(root, 'accordion')?.children).toHaveLength(3);

  await page.getByRole('button', { name: 'Select parent', exact: true }).click();
  await page.locator('.builder-structural-select').nth(2).click();
  await page.getByRole('button', { name: 'Move selected up', exact: true }).click();
  await page.getByRole('button', { name: 'Move selected up', exact: true }).click();
  root = await readBuilderModel(page);
  expect(findNode(root, 'accordion')?.children[0]?.id).not.toBe('item-1');

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  root = await readBuilderModel(page);
  expect(findNode(root, 'accordion')?.children).toHaveLength(3);

  await page.getByRole('button', { name: 'Select parent', exact: true }).click();
  const structuralRows = page.locator('.builder-structural-row');
  await structuralRows
    .last()
    .getByRole('button', { name: /Remove Accordion Item/ })
    .click();
  await structuralRows
    .first()
    .getByRole('button', { name: /Remove Accordion Item/ })
    .click();
  await expect(structuralRows).toHaveCount(1);
  await expect(
    structuralRows.first().getByRole('button', { name: /Remove Accordion Item/ }),
  ).toBeDisabled();

  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Saved · v2')).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(canvas.locator('[data-payload-node-type="accordion"]')).toHaveCount(1);
  root = await readBuilderModel(page);
  expect(findNode(root, 'accordion')?.children).toHaveLength(1);
  expect(findNode(root, 'accordion-item')?.props).toMatchObject({
    title: 'Renamed details',
  });
});

test('Phase 16 tabs expose ARIA runtime semantics and keyboard activation', async ({
  page,
  request,
  canonicalEnvironment,
}) => {
  test.setTimeout(120_000);
  await openCanonicalBuilder(page, request, canonicalEnvironment, 'phase-16-tabs');
  await page.getByRole('button', { name: 'Tabs add', exact: true }).click();
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await page
    .getByRole('treeitem', { name: 'Select Tab Item', exact: true })
    .first()
    .click();
  await page.getByLabel('Tab label', { exact: true }).fill('Overview');

  await page.getByRole('button', { name: 'Select parent', exact: true }).click();
  await page.getByRole('button', { name: '+ Add Tab', exact: true }).click();
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await page
    .getByRole('treeitem', { name: 'Select Tab Item', exact: true })
    .nth(1)
    .click();
  await page.getByRole('button', { name: 'Add blocks', exact: true }).click();
  await page.getByRole('button', { name: 'Image add', exact: true }).click();

  const root = await readBuilderModel(page);
  expect(findNode(root, 'tabs')?.children).toHaveLength(3);
  expect(findNodes(root, 'image')).toHaveLength(1);

  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Live preview', exact: true }).click();
  const preview = await popupPromise;
  await expect(preview.locator('[role="tablist"]')).toBeVisible({ timeout: 15_000 });
  const tabs = preview.getByRole('tab');
  await tabs.first().focus();
  await tabs.first().press('ArrowRight');
  await tabs.nth(1).press('Enter');
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(preview.locator('[role="tabpanel"]').nth(1)).toBeVisible();
  await expect(preview.locator('[role="tabpanel"]').first()).toHaveAttribute(
    'hidden',
    '',
  );
  await preview.close();
});

test('Phase 18.2 paints responsive component-part styles before save and after reload', async ({
  page,
  request,
  canonicalEnvironment,
}) => {
  test.setTimeout(120_000);
  await openCanonicalBuilder(page, request, canonicalEnvironment, 'phase-18-2-parts');
  const canvas = page.frameLocator('iframe.gjs-frame');

  await page.getByRole('button', { name: 'Accordion add', exact: true }).click();
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await page.getByRole('treeitem', { name: 'Select Accordion', exact: true }).click();
  await page.getByRole('tab', { name: 'Style', exact: true }).click();
  await page
    .locator('.builder-inspector-field')
    .filter({ hasText: /^Target/ })
    .locator('select')
    .selectOption('trigger');

  const partStyleSection = page
    .locator('details.builder-inspector-section')
    .filter({ hasText: 'Component part' });
  await partStyleSection.getByLabel('All', { exact: true }).fill('20');
  const trigger = canvas.locator('[data-payload-part="trigger"]').first();
  await expect(trigger).toHaveCSS('padding', '20px');

  await page.getByRole('button', { name: 'Tablet', exact: true }).click();
  await partStyleSection.getByLabel('All', { exact: true }).fill('32');
  await expect(trigger).toHaveCSS('padding', '32px');
  await page.getByRole('button', { name: 'Mobile', exact: true }).click();
  await partStyleSection.getByLabel('All', { exact: true }).fill('16');
  await expect(trigger).toHaveCSS('padding', '16px');

  const authoredBeforeViewportCycle = await canvas
    .locator('[data-payload-node-type="accordion"]')
    .getAttribute('data-payload-parts-style');
  await page.getByRole('button', { name: 'Desktop', exact: true }).click();
  await page.getByRole('button', { name: 'Tablet', exact: true }).click();
  await page.getByRole('button', { name: 'Mobile', exact: true }).click();
  await page.getByRole('button', { name: 'Desktop', exact: true }).click();
  expect(
    await canvas
      .locator('[data-payload-node-type="accordion"]')
      .getAttribute('data-payload-parts-style'),
  ).toBe(authoredBeforeViewportCycle);
  await expect(trigger).toHaveCSS('padding', '20px');

  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Saved · v2')).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(
    page
      .frameLocator('iframe.gjs-frame')
      .locator('[data-payload-part="trigger"]')
      .first(),
  ).toHaveCSS('padding', '20px');
});

test('Phase 16 gallery enforces image-only structure and responsive authored styles', async ({
  page,
  request,
  canonicalEnvironment,
}) => {
  test.setTimeout(120_000);
  await openCanonicalBuilder(page, request, canonicalEnvironment, 'phase-16-gallery');
  const canvas = page.frameLocator('iframe.gjs-frame');
  await page.getByRole('button', { name: 'Gallery add', exact: true }).click();
  await expect(canvas.locator('[data-payload-node-type="gallery"]')).toHaveCount(1);
  expect(findNodes(await readBuilderModel(page), 'image')).toHaveLength(3);

  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await page.getByRole('treeitem', { name: 'Select Gallery', exact: true }).click();
  await page.getByRole('tab', { name: 'Style', exact: true }).click();
  await page
    .getByLabel('Grid columns', { exact: true })
    .fill('repeat(3, minmax(0, 1fr))');
  await page.getByRole('button', { name: 'Tablet', exact: true }).click();
  await page
    .getByLabel('Grid columns', { exact: true })
    .fill('repeat(2, minmax(0, 1fr))');
  await page.getByRole('button', { name: 'Mobile', exact: true }).click();
  await page.getByLabel('Grid columns', { exact: true }).fill('minmax(0, 1fr)');

  await page.getByRole('tab', { name: 'Content', exact: true }).click();
  await page.getByRole('button', { name: '+ Add Image', exact: true }).click();
  const gallery = findNode(await readBuilderModel(page), 'gallery');
  expect(gallery?.children).toHaveLength(4);
  // The structural command selects the inserted child. Return to the parent
  // through Layers before continuing to exercise its slot controls.
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await page.getByRole('treeitem', { name: 'Select Gallery', exact: true }).click();
  await page.getByRole('tab', { name: 'Content', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '+ Add Image', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add blocks', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Button add', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Button add', exact: true }).click();
  expect(findNode(await readBuilderModel(page), 'gallery')?.children).toHaveLength(4);

  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Saved · v2')).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(canvas.locator('[data-payload-node-type="gallery"]')).toHaveCount(1, {
    timeout: 15_000,
  });
  const reloaded = findNode(await readBuilderModel(page), 'gallery');
  expect(reloaded?.children).toHaveLength(4);
  expect(reloaded?.style).toMatchObject({
    base: { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' },
    tablet: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
    mobile: { gridTemplateColumns: 'minmax(0, 1fr)' },
  });
  expect(canvas.locator('img[data-payload-node-type="image"]')).toHaveCount(4);
});

test('Phase 16 quote uses the generic content and style inspector', async ({
  page,
  request,
  canonicalEnvironment,
}) => {
  test.setTimeout(120_000);
  await openCanonicalBuilder(page, request, canonicalEnvironment, 'phase-16-quote');
  const canvas = page.frameLocator('iframe.gjs-frame');
  await page.getByRole('button', { name: 'Quote add', exact: true }).click();
  await canvas.locator('blockquote[data-payload-node-type="quote"]').click();
  await page.getByLabel('Quote', { exact: true }).fill('A durable platform');
  await page.getByLabel('Citation', { exact: true }).fill('The team');
  await page.getByRole('tab', { name: 'Style', exact: true }).click();
  await page.getByText('Typography', { exact: true }).click();
  await page.getByLabel('Font size', { exact: true }).fill('28');

  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Saved · v2')).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(
    canvas.locator('blockquote[data-payload-node-type="quote"]'),
  ).toContainText('A durable platform');
  await expect(canvas.locator('cite')).toHaveText('The team');
  expect(findNode(await readBuilderModel(page), 'quote')?.props).toMatchObject({
    text: 'A durable platform',
    cite: 'The team',
  });
});
