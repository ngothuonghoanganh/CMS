import { expect, type Page } from '@playwright/test';
import { openCanonicalBuilder, test } from './fixtures/canonical-environment';
import { E2E_RENDERER_ORIGIN } from './fixtures/urls';

type BuilderNode = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  style?: Record<string, Record<string, unknown>>;
  children: BuilderNode[];
};

type BuilderPayload = {
  version: number;
  root: BuilderNode;
  behaviors: Array<Record<string, unknown>>;
};

async function readPayload(page: Page): Promise<BuilderPayload | undefined> {
  return page.evaluate(() => {
    const debug = (
      window as Window & { __payloadBuilderDebug?: { getPayload: () => unknown } }
    ).__payloadBuilderDebug;
    return debug?.getPayload() as BuilderPayload | undefined;
  });
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

function listItems(list: BuilderNode): Array<{ id: string; text: string }> {
  return Array.isArray(list.props.items)
    ? (list.props.items as Array<{ id: string; text: string }>)
    : [];
}

function attachRuntimeErrorCapture(page: Page, errors: string[]): void {
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(`console: ${message.text()} (${message.location().url})`);
    }
  });
}

async function addPreset(page: Page, presetId: string): Promise<void> {
  await page.getByRole('button', { name: 'Add blocks', exact: true }).click();
  const card = page.locator(
    `.builder-block-card[data-block-type="${presetId}"][data-block-category="preset"]`,
  );
  await expect(card).toBeVisible();
  await card.locator('.builder-block-add').click();
}

async function selectLayers(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await expect(
    page.getByRole('tree', { name: 'Page layers', exact: true }),
  ).toBeVisible();
}

test('authors native List, FAQ, Tabs, and Gallery through the release journey', async ({
  browser,
  page,
  request,
  canonicalEnvironment,
}) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(7_000);
  const runtimeErrors: string[] = [];
  const testSlug = 'phase-24-native-open-composition-release-gate';

  const temporaryPage = await openCanonicalBuilder(
    page,
    request,
    canonicalEnvironment,
    testSlug,
  );
  attachRuntimeErrorCapture(page, runtimeErrors);
  const galleryAssetSource = '/assets/placeholder.svg';

  try {
    await page.getByRole('button', { name: 'Design', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Design', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');

    await addPreset(page, 'native-list');
    await expect.poll(async () => (await readPayload(page))?.version).toBe(8);
    await selectLayers(page);
    const listLayer = page.getByRole('treeitem', { name: 'Select List', exact: true });
    await expect(listLayer).toBeVisible();
    await listLayer.click();

    const firstItem = page.getByLabel('Item 1', { exact: true });
    await firstItem.click();
    await firstItem.selectText();
    await firstItem.pressSequentially('First edited');
    await expect(firstItem).toBeFocused();
    await page.getByRole('button', { name: '+ Add item', exact: true }).click();
    await page.getByLabel('Item 2', { exact: true }).fill('Second edited');
    await page.getByRole('button', { name: '+ Add item', exact: true }).click();
    await page.getByLabel('Item 3', { exact: true }).fill('Third edited');

    const listBeforeReorder = await readPayload(page);
    const nativeListBeforeReorder = listBeforeReorder
      ? findNode(listBeforeReorder.root, 'list')
      : undefined;
    const listIds = nativeListBeforeReorder
      ? listItems(nativeListBeforeReorder).map((item) => item.id)
      : [];
    expect(listIds).toHaveLength(3);

    await page.getByRole('button', { name: 'Move item 3 up', exact: true }).click();
    await page.getByRole('button', { name: 'Remove item 2', exact: true }).click();
    await page.getByLabel('List type', { exact: true }).selectOption('true');
    await expect
      .poll(async () => findNode((await readPayload(page))!.root, 'list')?.props.ordered)
      .toBe(true);
    await expect(
      page.frameLocator('iframe.gjs-frame').locator('ol[data-payload-node-type="list"]'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect
      .poll(async () => findNode((await readPayload(page))!.root, 'list')?.props.ordered)
      .toBe(false);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect
      .poll(async () => findNode((await readPayload(page))!.root, 'list')?.props.ordered)
      .toBe(true);

    await page.getByRole('button', { name: 'Add blocks', exact: true }).click();
    await addPreset(page, 'faq');
    await selectLayers(page);
    const activeManagedLayers = page.locator(
      '[data-builder-layer-managed="active"] .builder-layer-managed-indicator[data-builder-layer-managed-state="active"]',
    );
    // Managed internals are available immediately after inserting the
    // compound block; they do not depend on adding a layout child first.
    await expect(activeManagedLayers).toHaveCount(4);
    const faqLayer = page.getByRole('treeitem', { name: 'Select FAQ', exact: true });
    await expect(faqLayer).toBeVisible();
    await faqLayer.click();
    await expect(
      page.getByLabel('Allow multiple answers to stay open', { exact: true }),
    ).toBeVisible();

    const faqItems = page.locator('[aria-label="FAQ questions"] .builder-structure-item');
    await expect(faqItems).toHaveCount(1);
    await faqItems.first().getByRole('button').first().click();
    await page
      .getByLabel('Question', { exact: true })
      .fill('What is your return policy?');
    await page.getByRole('button', { name: 'Edit answer', exact: true }).click();
    await page
      .locator('.builder-structural-editor')
      .last()
      .getByRole('button', { name: 'Text', exact: true })
      .click();
    await page
      .getByLabel('Text', { exact: true })
      .fill('Returns accepted within 30 days.');

    await faqLayer.click();
    await page.getByRole('button', { name: '+ Add question', exact: true }).click();
    await faqLayer.click();
    await expect(faqItems).toHaveCount(2);
    await faqItems.last().getByRole('button').first().click();
    await page.getByLabel('Question', { exact: true }).fill('Can I change my order?');

    await faqLayer.click();
    await faqItems.first().getByRole('button').first().click();
    await faqLayer.click();
    await page
      .getByRole('button', { name: 'Duplicate What is your return policy?', exact: true })
      .click();
    await faqLayer.click();
    await expect(faqItems).toHaveCount(3);
    await page
      .getByRole('button', {
        name: 'Move What is your return policy? down',
        exact: true,
      })
      .first()
      .click();
    await faqLayer.click();
    await page
      .getByRole('button', {
        name: 'Remove What is your return policy?',
        exact: true,
      })
      .last()
      .click();
    await expect(faqItems).toHaveCount(2);

    const managedLayer = page.locator('.builder-layer-managed-indicator').first();
    await expect(managedLayer).toBeVisible();
    await expect(managedLayer).toHaveText('Managed');

    await page.getByRole('button', { name: 'Add blocks', exact: true }).click();
    await addPreset(page, 'native-tabs');
    await selectLayers(page);
    await expect(activeManagedLayers).toHaveCount(12);
    const tabsLayer = page.getByRole('treeitem', { name: 'Select Tabs', exact: true });
    await expect(tabsLayer).toBeVisible();
    await tabsLayer.click();
    const tabItems = page.locator('[aria-label="Tabs tabs"] .builder-structure-item');
    await expect(tabItems).toHaveCount(1);
    await tabItems.first().getByRole('button').first().click();
    await page.getByLabel('Tab name', { exact: true }).fill('Overview & benefits');
    await page.getByRole('button', { name: 'Edit tab content', exact: true }).click();
    await page
      .locator('.builder-structural-editor')
      .last()
      .getByRole('button', { name: 'Text', exact: true })
      .click();
    await page
      .getByLabel('Text', { exact: true })
      .fill('Everything included in the plan.');

    await tabsLayer.click();
    await page.getByRole('button', { name: '+ Add tab', exact: true }).click();
    await tabsLayer.click();
    await expect(tabItems).toHaveCount(2);
    await tabItems.last().getByRole('button').first().click();
    await page.getByLabel('Tab name', { exact: true }).fill('Pricing');
    await tabsLayer.click();
    await tabItems.first().getByRole('button').first().click();
    await tabsLayer.click();
    await page
      .getByRole('button', { name: 'Duplicate Overview & benefits', exact: true })
      .click();
    await tabsLayer.click();
    await expect(tabItems).toHaveCount(3);
    await page.getByRole('button', { name: 'Move Pricing up', exact: true }).click();
    await tabsLayer.click();
    await page
      .getByRole('button', { name: 'Remove Overview & benefits', exact: true })
      .last()
      .click();
    await expect(tabItems).toHaveCount(2);

    await tabsLayer.click();
    await page.getByLabel('Direction', { exact: true }).selectOption('vertical');
    await expect
      .poll(
        async () => findNode((await readPayload(page))!.root, 'tabs')?.props.orientation,
      )
      .toBe('vertical');
    await page.getByLabel('Direction', { exact: true }).selectOption('horizontal');

    await page.getByRole('button', { name: 'Add blocks', exact: true }).click();
    await addPreset(page, 'gallery-3-columns');
    await selectLayers(page);
    const gridLayer = page.getByRole('treeitem', { name: 'Select Grid', exact: true });
    await expect(gridLayer).toBeVisible();
    await gridLayer.click();
    const firstImageLayer = page
      .getByRole('treeitem', { name: 'Select Image', exact: true })
      .first();
    await firstImageLayer.click();
    const imageUrl = page.getByLabel('Image URL', { exact: true });
    await imageUrl.fill(galleryAssetSource);
    await imageUrl.blur();
    await expect
      .poll(async () => findNodes((await readPayload(page))!.root, 'image')[0]?.props.src)
      .toBe(galleryAssetSource);

    await gridLayer.click();
    await page.getByRole('tab', { name: 'Style', exact: true }).click();
    const layoutSummary = page.locator('summary').filter({ hasText: 'Layout' }).first();
    if ((await layoutSummary.locator('..').getAttribute('open')) === null) {
      await layoutSummary.click();
    }
    const columns = page.getByRole('group', { name: 'Columns', exact: true });
    await columns.getByRole('button', { name: '4', exact: true }).click();
    await expect
      .poll(async () => findNode((await readPayload(page))!.root, 'grid')?.style?.base)
      .toEqual(
        expect.objectContaining({
          gridTemplateColumns: expect.stringContaining('repeat(4'),
        }),
      );

    await page.getByRole('tab', { name: 'Content', exact: true }).click();
    const addContent = page.getByLabel('Add content to Grid', { exact: true });
    await addContent.selectOption('image');
    await addContent
      .locator('..')
      .getByRole('button', { name: 'Add', exact: true })
      .click();
    await expect
      .poll(async () => findNodes((await readPayload(page))!.root, 'image').length)
      .toBe(7);
    const imageLayers = page.getByRole('treeitem', { name: 'Select Image', exact: true });
    await expect(imageLayers).toHaveCount(7);
    for (let index = 0; index < 7; index += 1) {
      await imageLayers.nth(index).click();
      const imageUrlField = page.getByLabel('Image URL', { exact: true });
      await imageUrlField.fill(galleryAssetSource);
      await imageUrlField.blur();
    }
    await expect
      .poll(async () =>
        findNodes((await readPayload(page))!.root, 'image').map(
          (image) => image.props.src,
        ),
      )
      .toEqual(Array.from({ length: 7 }, () => galleryAssetSource));
    await gridLayer.click();
    const gridStructure = page.locator('.builder-structural-editor').last();
    await gridStructure
      .locator('.builder-structure-item')
      .first()
      .getByRole('button', { name: 'Move Image down', exact: true })
      .click();
    await gridLayer.click();
    await gridStructure
      .locator('.builder-structure-item')
      .last()
      .getByRole('button', { name: 'Remove Image', exact: true })
      .click();
    await expect
      .poll(async () => findNodes((await readPayload(page))!.root, 'image').length)
      .toBe(6);

    await page.getByRole('button', { name: 'Mobile', exact: true }).click();
    await expect(page.locator('.builder-properties-panel')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.builder-editor-host')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThan(48);
    await page.setViewportSize({ width: 1440, height: 900 });

    const draftPayload = await readPayload(page);
    expect(draftPayload?.version).toBe(8);
    const draftList = draftPayload && findNode(draftPayload.root, 'list');
    expect(draftList?.props).toMatchObject({ ordered: true });
    const persistedListItems = listItems(draftList!);
    expect(persistedListItems).toHaveLength(2);
    expect(persistedListItems.every((item) => listIds.includes(item.id))).toBe(true);
    expect(new Set(persistedListItems.map((item) => item.id)).size).toBe(2);
    const draftFaq = draftPayload && findNode(draftPayload.root, 'disclosure');
    expect(draftFaq?.children).toHaveLength(2);
    expect(
      draftFaq?.children.every(
        (item) =>
          item.children.map((child) => child.type).join(',') ===
          'button,disclosure-panel',
      ),
    ).toBe(true);
    const draftTabs = draftPayload && findNode(draftPayload.root, 'tabs');
    expect(
      draftTabs?.children.filter((child) => child.type === 'tab-panel'),
    ).toHaveLength(2);
    expect(
      draftTabs?.children.find((child) => child.type === 'tab-list')?.children,
    ).toHaveLength(2);
    expect(findNodes(draftPayload!.root, 'gallery')).toHaveLength(0);
    expect(findNodes(draftPayload!.root, 'grid')).toHaveLength(1);

    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.locator('.builder-save-status')).toContainText('Saved', {
      timeout: 15_000,
    });
    await page.reload();
    await expect(page.locator('.builder-editor-host iframe.gjs-frame')).toBeAttached({
      timeout: 15_000,
    });
    await expect.poll(async () => (await readPayload(page))?.version).toBe(8);
    await expect(
      page.getByRole('button', { name: 'Design', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');

    const reloadedPayload = await readPayload(page);
    expect(reloadedPayload?.root).toEqual(draftPayload?.root);
    expect(reloadedPayload?.behaviors).toEqual(draftPayload?.behaviors);

    const [previewPage] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByRole('button', { name: 'Live preview', exact: true }).click(),
    ]);
    previewPage.setDefaultTimeout(10_000);
    attachRuntimeErrorCapture(previewPage, runtimeErrors);
    await expect(previewPage.locator('.payload-open-composition')).toBeVisible();
    await expect(previewPage.locator('ol[data-payload-node-type="list"]')).toBeVisible();
    await expect(previewPage.getByRole('tablist')).toBeVisible();
    await previewPage.close();

    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.locator('.builder-save-status')).toContainText('Saved', {
      timeout: 15_000,
    });
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.locator('.builder-alert.alert-success')).toContainText(
      'Page published',
      { timeout: 15_000 },
    );

    const publicPage = await browser.newPage({ baseURL: E2E_RENDERER_ORIGIN });
    publicPage.setDefaultTimeout(10_000);
    attachRuntimeErrorCapture(publicPage, runtimeErrors);
    try {
      await publicPage.goto(`/${temporaryPage.siteSlug}/${temporaryPage.slug}?phase=24`);
      await expect(publicPage.locator('ol[data-payload-node-type="list"]')).toBeVisible();
      await expect(publicPage.locator('ul[data-payload-node-type="list"]')).toHaveCount(
        0,
      );
      await expect(publicPage.locator('ol[data-payload-node-type="list"] li')).toHaveText(
        ['First edited', 'Second edited'],
      );

      const firstQuestion = publicPage.getByRole('button', {
        name: 'What is your return policy?',
        exact: true,
      });
      const secondQuestion = publicPage.getByRole('button', {
        name: 'Can I change my order?',
        exact: true,
      });
      await firstQuestion.click();
      await expect(publicPage.getByRole('region').first()).toBeVisible();
      await secondQuestion.click();
      await expect(publicPage.getByRole('region').first()).toBeVisible();
      await expect(publicPage.locator('[role="region"]:not([hidden])')).toHaveCount(1);

      const tabs = publicPage.getByRole('tab');
      await expect(tabs).toHaveCount(2);
      const firstTab = tabs.first();
      const secondTab = tabs.last();
      await firstTab.focus();
      await firstTab.press('ArrowRight');
      await expect(secondTab).toHaveAttribute('aria-selected', 'true');
      await secondTab.press('Home');
      await expect(firstTab).toHaveAttribute('aria-selected', 'true');
      const controlsId = await firstTab.getAttribute('aria-controls');
      expect(controlsId).toBeTruthy();
      await expect(publicPage.locator(`#${controlsId}`)).toHaveAttribute(
        'aria-labelledby',
        await firstTab.getAttribute('id'),
      );

      const galleryGrid = publicPage.locator('[data-payload-node-type="grid"]');
      await expect(galleryGrid).toHaveCount(1);
      await expect(galleryGrid.locator('img')).toHaveCount(6);
      await expect
        .poll(async () =>
          galleryGrid.evaluate(
            (element) =>
              getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length,
          ),
        )
        .toBe(4);
    } finally {
      await publicPage.close();
    }

    expect(runtimeErrors).toEqual([]);
  } finally {
    await temporaryPage.dispose();
  }
});
