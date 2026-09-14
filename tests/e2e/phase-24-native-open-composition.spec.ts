import { expect, type Page } from '@playwright/test';
import {
  createDefaultSiteDesignSystem,
  SiteDesignSystemSchema,
} from '@payload/contracts';
import { openCanonicalBuilder, test } from './fixtures/canonical-environment';
import { E2E_API_BASE_URL, E2E_RENDERER_ORIGIN } from './fixtures/urls';

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

function countPersistedNodes(node: BuilderNode): number {
  return (
    1 + node.children.reduce((count, child) => count + countPersistedNodes(child), 0)
  );
}

function customPhase24DesignSystem() {
  const base = createDefaultSiteDesignSystem();
  const grid = base.componentDefaults?.grid;
  const form = base.componentDefaults?.form;
  const input = form?.partsStyle?.input;
  return SiteDesignSystemSchema.parse({
    ...base,
    colors: base.colors.map(
      (token) =>
        ({
          ...token,
          ...(token.id === 'color-primary' ? { value: '#9f1239' } : {}),
          ...(token.id === 'color-surface' ? { value: '#fff7ed' } : {}),
          ...(token.id === 'color-text' ? { value: '#172554' } : {}),
          ...(token.id === 'color-border' ? { value: '#c2410c' } : {}),
        }) as (typeof base.colors)[number],
    ),
    typography: base.typography.map((token) =>
      token.id === 'type-body'
        ? { ...token, fontFamily: 'Georgia, serif', fontSize: '17px' }
        : token,
    ),
    spacing: base.spacing.map((token) =>
      token.id === 'space-1'
        ? { ...token, value: '10px' }
        : token.id === 'space-2'
          ? { ...token, value: '24px' }
          : token,
    ),
    radii: base.radii.map((token) =>
      token.id === 'radius-md' ? { ...token, value: '18px' } : token,
    ),
    componentDefaults: {
      ...base.componentDefaults,
      grid: {
        ...grid,
        style: {
          ...(grid?.style ?? { base: {} }),
          base: { ...(grid?.style?.base ?? {}), gap: '24px' },
          tablet: { ...(grid?.style?.tablet ?? {}), gap: '30px' },
          mobile: { ...(grid?.style?.mobile ?? {}), gap: '36px' },
        },
      },
      form: {
        ...form,
        partsStyle: {
          ...(form?.partsStyle ?? {}),
          input: {
            ...(input ?? { base: {} }),
            tablet: { ...(input?.tablet ?? {}), borderRadius: '22px' },
            mobile: { ...(input?.mobile ?? {}), borderRadius: '20px' },
          },
        },
      },
    },
  });
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

  const customDesignSystem = customPhase24DesignSystem();
  const designSystemUpdate = await request.patch(
    `${E2E_API_BASE_URL}/workspaces/${canonicalEnvironment.workspaceId}/design-system`,
    { data: customDesignSystem },
  );
  expect(designSystemUpdate.ok()).toBe(true);
  const designSystemPublish = await request.post(
    `${E2E_API_BASE_URL}/workspaces/${canonicalEnvironment.workspaceId}/design-system/publish`,
    { data: { designSystem: customDesignSystem } },
  );
  expect(designSystemPublish.ok(), await designSystemPublish.text()).toBe(true);

  // The canonical fixture may retain an explicit site-level default snapshot
  // from an earlier run. Clear that sparse override so this journey verifies
  // workspace inheritance rather than an unrelated site-local value.
  const siteDesignSystemReset = await request.patch(
    `${E2E_API_BASE_URL}/workspaces/${canonicalEnvironment.workspaceId}/sites/${canonicalEnvironment.siteId}/design-system`,
    { data: { override: { version: 1 } } },
  );
  expect(siteDesignSystemReset.ok(), await siteDesignSystemReset.text()).toBe(true);
  const siteDesignSystemPublish = await request.post(
    `${E2E_API_BASE_URL}/workspaces/${canonicalEnvironment.workspaceId}/sites/${canonicalEnvironment.siteId}/design-system/publish`,
    { data: { designSystem: customDesignSystem } },
  );
  expect(siteDesignSystemPublish.ok(), await siteDesignSystemPublish.text()).toBe(true);

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

    await addPreset(page, 'blank-section');
    await selectLayers(page);
    const activeManagedLayers = page.locator(
      '[data-builder-layer-managed="active"] .builder-layer-managed-indicator[data-builder-layer-managed-state="active"]',
    );
    await expect
      .poll(async () => {
        const payload = await readPayload(page);
        return payload ? await activeManagedLayers.count() : 0;
      })
      .toBe(countPersistedNodes((await readPayload(page))!.root));
    const promotedSectionId = findNode((await readPayload(page))!.root, 'section')?.id;
    expect(promotedSectionId).toBeTruthy();
    const promotedSection = page
      .frameLocator('iframe.gjs-frame')
      .locator(`[data-payload-node-id="${promotedSectionId}"]`);
    const sectionStylesBeforePromotion = await promotedSection.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        backgroundColor: styles.backgroundColor,
        color: styles.color,
        padding: styles.padding,
      };
    });

    await addPreset(page, 'native-list');
    await expect.poll(async () => (await readPayload(page))?.version).toBe(8);
    await selectLayers(page);
    const listLayer = page.getByRole('treeitem', { name: 'Select List', exact: true });
    await expect(listLayer).toBeVisible();
    expect(findNode((await readPayload(page))!.root, 'section')?.id).toBe(
      promotedSectionId,
    );
    await expect
      .poll(async () =>
        promotedSection.evaluate((element) => {
          const styles = getComputedStyle(element);
          return {
            backgroundColor: styles.backgroundColor,
            color: styles.color,
            padding: styles.padding,
          };
        }),
      )
      .toEqual(sectionStylesBeforePromotion);
    await expect
      .poll(async () => activeManagedLayers.count())
      .toBe(countPersistedNodes((await readPayload(page))!.root));
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

    await addPreset(page, 'contact-form');
    await selectLayers(page);
    await expect
      .poll(async () => activeManagedLayers.count())
      .toBe(countPersistedNodes((await readPayload(page))!.root));
    const contactForm = page
      .frameLocator('iframe.gjs-frame')
      .locator('form[data-payload-node-type="form"]')
      .first();
    const contactInput = contactForm.locator('input[data-payload-part="input"]').first();
    const contactSubmit = contactForm.locator('button[data-payload-part="submit"]');
    await expect(contactForm).toBeVisible();
    await expect(contactInput).toBeVisible();
    await expect(contactSubmit).toBeVisible();
    await expect
      .poll(async () =>
        contactForm.evaluate((element) => getComputedStyle(element).backgroundColor),
      )
      .toBe('rgb(255, 247, 237)');
    await expect
      .poll(async () =>
        contactInput.evaluate((element) => getComputedStyle(element).borderRadius),
      )
      .toBe('18px');
    await expect
      .poll(async () =>
        contactSubmit.evaluate((element) => getComputedStyle(element).backgroundColor),
      )
      .toBe('rgb(159, 18, 57)');
    const contactPayload = await readPayload(page);
    expect(findNode(contactPayload!.root, 'form')?.style).toBeUndefined();
    expect(findNodes(contactPayload!.root, 'input')[0]?.style).toBeUndefined();

    const contactFormLayer = page.getByRole('treeitem', {
      name: 'Select Form',
      exact: true,
    });
    await contactFormLayer.click();
    await page.getByRole('tab', { name: 'Style', exact: true }).click();
    await page
      .locator('[aria-label="Style target"] .builder-component-part-target')
      .filter({ hasText: /^input$/ })
      .click();
    const inputRadius = page
      .locator('details.builder-inspector-section')
      .filter({ has: page.locator('summary', { hasText: 'Component part' }) })
      .getByLabel('Corner radius', { exact: true });
    await inputRadius.fill('26');
    await inputRadius.blur();
    await expect
      .poll(
        async () =>
          findNode((await readPayload(page))!.root, 'form')?.partsStyle?.input?.base,
      )
      .toEqual(expect.objectContaining({ borderRadius: '26px' }));
    await expect
      .poll(async () =>
        contactInput.evaluate((element) => getComputedStyle(element).borderRadius),
      )
      .toBe('26px');
    await page
      .getByRole('button', { name: 'Reset Corner radius override', exact: true })
      .click();
    await expect
      .poll(
        async () =>
          findNode((await readPayload(page))!.root, 'form')?.partsStyle?.input?.base,
      )
      .not.toEqual(expect.objectContaining({ borderRadius: expect.anything() }));
    await expect
      .poll(async () =>
        contactInput.evaluate((element) => getComputedStyle(element).borderRadius),
      )
      .toBe('18px');

    await page.getByRole('button', { name: 'Tablet', exact: true }).click();
    await inputRadius.fill('28');
    await inputRadius.blur();
    await expect
      .poll(
        async () =>
          findNode((await readPayload(page))!.root, 'form')?.partsStyle?.input?.tablet,
      )
      .toEqual(expect.objectContaining({ borderRadius: '28px' }));
    await expect
      .poll(async () =>
        contactInput.evaluate((element) => getComputedStyle(element).borderRadius),
      )
      .toBe('28px');
    await page
      .getByRole('button', { name: 'Reset Corner radius override', exact: true })
      .click();
    await expect
      .poll(async () =>
        contactInput.evaluate((element) => getComputedStyle(element).borderRadius),
      )
      .toBe('22px');
    await page.getByRole('button', { name: 'Desktop', exact: true }).click();

    await addPreset(page, 'faq');
    await selectLayers(page);
    await expect
      .poll(async () => activeManagedLayers.count())
      .toBe(countPersistedNodes((await readPayload(page))!.root));
    const faqLayer = page.getByRole('treeitem', { name: 'Select FAQ', exact: true });
    await expect(faqLayer).toBeVisible();
    await faqLayer.click();
    await page.getByRole('tab', { name: 'Content', exact: true }).click();
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
    await expect
      .poll(async () => activeManagedLayers.count())
      .toBe(countPersistedNodes((await readPayload(page))!.root));
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
    await expect(
      page.locator(
        '.builder-block-card[data-block-type="gallery"][data-block-category="preset"]',
      ),
    ).toHaveCount(1);
    await addPreset(page, 'gallery');
    await selectLayers(page);
    const gridLayer = page.getByRole('treeitem', { name: 'Select Grid', exact: true });
    await expect(gridLayer).toBeVisible();
    await gridLayer.click();
    const firstImageLayer = page
      .getByRole('treeitem', { name: 'Select Image', exact: true })
      .first();
    const imageIdsBeforeLayoutEdit = findNodes(
      (await readPayload(page))!.root,
      'image',
    ).map((image) => image.id);
    expect(imageIdsBeforeLayoutEdit).toHaveLength(6);
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
    const columns = page.getByLabel('Columns', { exact: true });
    for (const count of [1, 2, 4, 5, 8, 12]) {
      await columns.fill(String(count));
      await columns.blur();
      await expect
        .poll(async () => findNode((await readPayload(page))!.root, 'grid')?.style?.base)
        .toEqual(
          expect.objectContaining({
            gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
          }),
        );
    }
    await columns.fill('8');
    await columns.blur();
    await expect
      .poll(async () => findNode((await readPayload(page))!.root, 'grid')?.style?.base)
      .toEqual(
        expect.objectContaining({
          gridTemplateColumns: 'repeat(8, minmax(0, 1fr))',
        }),
      );
    expect(
      findNodes((await readPayload(page))!.root, 'image').map((image) => image.id),
    ).toEqual(imageIdsBeforeLayoutEdit);

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
    await imageLayers.last().click();
    const imageUrlField = page.getByLabel('Image URL', { exact: true });
    await imageUrlField.fill(galleryAssetSource);
    await imageUrlField.blur();
    await expect
      .poll(async () =>
        findNodes((await readPayload(page))!.root, 'image').map(
          (image) => image.props.src,
        ),
      )
      .toContain(galleryAssetSource);
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
    expect(findNode((await readPayload(page))!.root, 'grid')?.style?.base).toEqual(
      expect.objectContaining({
        gridTemplateColumns: 'repeat(8, minmax(0, 1fr))',
      }),
    );

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
        .toBe(8);
    } finally {
      await publicPage.close();
    }

    expect(runtimeErrors).toEqual([]);
  } finally {
    await temporaryPage.dispose();
  }
});
