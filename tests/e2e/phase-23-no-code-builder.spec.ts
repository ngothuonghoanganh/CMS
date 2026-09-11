import { test, expect, openCanonicalBuilder } from './fixtures/canonical-environment';

type BuilderNode = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  style?: Record<string, Record<string, unknown>>;
  children: BuilderNode[];
};

async function readPayload(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const debug = (
      window as Window & { __payloadBuilderDebug?: { getPayload: () => unknown } }
    ).__payloadBuilderDebug;
    return debug?.getPayload() as
      { version: number; root: BuilderNode; behaviors: unknown[] } | undefined;
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

function countNodes(root: BuilderNode, type: string): number {
  return (
    (root.type === type ? 1 : 0) +
    root.children.reduce((count, child) => count + countNodes(child, type), 0)
  );
}

test('no-code author can create and edit a Contact Form composition', async ({
  page,
  request,
  canonicalEnvironment,
}) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(5_000);
  const temporaryPage = await openCanonicalBuilder(
    page,
    request,
    canonicalEnvironment,
    'phase-23-contact-form',
  );

  try {
    await page.getByRole('button', { name: 'Contact Form add', exact: true }).click();
    await expect.poll(async () => (await readPayload(page))?.version).toBe(8);

    const payload = await readPayload(page);
    expect(payload).toBeTruthy();
    expect(findNode(payload!.root, 'form')).toBeTruthy();
    expect(payload!.behaviors.length).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Layers', exact: true }).click();
    const formLayer = page.getByRole('treeitem', { name: 'Select Form', exact: true });
    await expect(formLayer).toBeVisible();
    await formLayer.click();
    await expect(page.getByRole('tab', { name: 'Content', exact: true })).toBeVisible();
    await expect(page.getByText('Message after sending', { exact: true })).toBeVisible();
    await expect(page.getByText('fieldKey', { exact: true })).toHaveCount(0);
    await expect(page.getByText('formKey', { exact: true })).toHaveCount(0);
    await expect(
      formLayer.locator('..').locator('.builder-layer-style-targets'),
    ).toHaveCount(0);

    const fieldLayer = page
      .getByRole('treeitem', {
        name: 'Select Form field',
        exact: true,
      })
      .first();
    await fieldLayer.click();
    await expect(page.getByLabel('Required field', { exact: true })).toBeVisible();
    await page.getByLabel('Required field', { exact: true }).check();

    const labelLayer = page
      .getByRole('treeitem', { name: 'Select Label', exact: true })
      .first();
    await labelLayer.click();
    await page.getByLabel('Text', { exact: true }).fill('Full name');
    await expect
      .poll(async () => findNode((await readPayload(page))!.root, 'label')?.props.text)
      .toBe('Full name');

    await formLayer.click();
    await page.getByRole('tab', { name: 'Style', exact: true }).click();
    await page.getByText('Background', { exact: true }).click();
    const background = page.getByLabel('Background color hex value', { exact: true });
    await background.fill('#112233', { timeout: 5_000 });
    await background.blur();
    await expect(background).not.toHaveAttribute('aria-invalid', 'true');

    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.locator('.builder-save-status')).toContainText('Saved', {
      timeout: 15_000,
    });
    await page.reload();
    await expect(page.locator('.builder-editor-host iframe.gjs-frame')).toBeAttached({
      timeout: 15_000,
    });
    await expect.poll(async () => (await readPayload(page))?.version).toBe(8);
    await expect
      .poll(async () => findNode((await readPayload(page))!.root, 'label')?.props.text)
      .toBe('Full name');
  } finally {
    await temporaryPage.dispose();
  }
});

test('no-code author can override and reset a responsive Open Composition value', async ({
  page,
  request,
  canonicalEnvironment,
}) => {
  test.setTimeout(120_000);
  const temporaryPage = await openCanonicalBuilder(
    page,
    request,
    canonicalEnvironment,
    'phase-23-responsive',
  );

  try {
    await page.getByRole('button', { name: 'Contact Form add', exact: true }).click();
    await expect.poll(async () => (await readPayload(page))?.version).toBe(8);
    await page.getByRole('button', { name: 'Layers', exact: true }).click();
    await page.getByRole('treeitem', { name: 'Select Form', exact: true }).click();
    await page.getByRole('tab', { name: 'Style', exact: true }).click();
    const sizeSummary = page.locator('summary').filter({ hasText: 'Size' });
    if ((await sizeSummary.locator('..').getAttribute('open')) === null) {
      await sizeSummary.click();
    }

    const width = page.getByLabel('Width', { exact: true });
    await width.fill('700');
    await width.blur();
    await expect
      .poll(
        async () => findNode((await readPayload(page))!.root, 'form')?.style?.base?.width,
      )
      .toBe('700px');

    await page.getByRole('button', { name: 'Mobile', exact: true }).click();
    await expect(page.getByText('Inherited from Desktop', { exact: true })).toBeVisible();
    await width.fill('80');
    await width.blur();
    await expect
      .poll(
        async () =>
          findNode((await readPayload(page))!.root, 'form')?.style?.mobile?.width,
      )
      .toBe('80px');
    await page.getByRole('button', { name: 'Reset Width override', exact: true }).click();
    await expect
      .poll(
        async () =>
          findNode((await readPayload(page))!.root, 'form')?.style?.mobile?.width,
      )
      .toBeUndefined();
    await expect(page.getByText('Inherited from Desktop', { exact: true })).toBeVisible();
  } finally {
    await temporaryPage.dispose();
  }
});

test('no-code author can add, duplicate, delete and undo a form field', async ({
  page,
  request,
  canonicalEnvironment,
}) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(5_000);
  const temporaryPage = await openCanonicalBuilder(
    page,
    request,
    canonicalEnvironment,
    'phase-23-form-structure',
  );

  try {
    await page.getByRole('button', { name: 'Contact Form add', exact: true }).click();
    await expect.poll(async () => (await readPayload(page))?.version).toBe(8);
    await page.getByRole('button', { name: 'Layers', exact: true }).click();
    const formLayer = page.getByRole('treeitem', { name: 'Select Form', exact: true });
    await formLayer.click();
    const initialFieldCount = countNodes((await readPayload(page))!.root, 'form-field');

    const addContent = page.getByLabel('Add content to Form', { exact: true });
    await addContent.selectOption('form-field');
    await addContent
      .locator('..')
      .getByRole('button', { name: 'Add', exact: true })
      .click();
    await expect
      .poll(async () => countNodes((await readPayload(page))!.root, 'form-field'))
      .toBe(initialFieldCount + 1);

    const newField = page
      .getByRole('treeitem', { name: 'Select Form field', exact: true })
      .last();
    await newField.click();
    await page.getByLabel('Required field', { exact: true }).check();
    const input = page
      .getByRole('treeitem', { name: 'Select Input', exact: true })
      .last();
    await input.click();
    await page.getByLabel('Field type', { exact: true }).selectOption('phone');

    await newField.click();
    await page
      .getByRole('button', { name: 'Clone selected element', exact: true })
      .click();
    await expect
      .poll(async () => countNodes((await readPayload(page))!.root, 'form-field'))
      .toBe(initialFieldCount + 2);

    await page
      .getByRole('button', { name: 'Remove selected element', exact: true })
      .click();
    await expect
      .poll(async () => countNodes((await readPayload(page))!.root, 'form-field'))
      .toBe(initialFieldCount + 1);
    await page.keyboard.press('Control+z');
    await expect
      .poll(async () => countNodes((await readPayload(page))!.root, 'form-field'))
      .toBe(initialFieldCount + 2);

    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.locator('.builder-save-status')).toContainText('Saved', {
      timeout: 15_000,
    });
    await page.reload();
    await expect
      .poll(async () => {
        const payload = await readPayload(page);
        return payload ? countNodes(payload.root, 'form-field') : 0;
      })
      .toBe(initialFieldCount + 2);
  } finally {
    await temporaryPage.dispose();
  }
});
