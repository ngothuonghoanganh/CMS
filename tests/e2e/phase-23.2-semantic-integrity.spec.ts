import { expect, openCanonicalBuilder, test } from './fixtures/canonical-environment';

type BuilderNode = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  children: BuilderNode[];
};

type BuilderPayload = {
  version: number;
  root: BuilderNode;
  behaviors: Array<Record<string, unknown>>;
};

async function readPayload(page: import('@playwright/test').Page) {
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

test('keeps composed text, field type and choice options canonical through reload', async ({
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
    'phase-23-2-semantic-integrity',
  );

  try {
    await page.getByRole('button', { name: 'Contact Form add', exact: true }).click();
    await expect.poll(async () => (await readPayload(page))?.version).toBe(8);

    await page.getByRole('button', { name: 'Layers', exact: true }).click();
    const button = page.getByRole('treeitem', { name: /Button: Submit/ }).first();
    await button.click();
    await page.getByLabel('Button text', { exact: true }).fill('Send now');
    await page.getByLabel('Button text', { exact: true }).blur();
    await expect
      .poll(async () => {
        const payload = await readPayload(page);
        const node = payload && findNode(payload.root, 'button');
        return {
          label: node?.props.label,
          childText: node?.children.find((child) => child.type === 'text')?.props.text,
        };
      })
      .toEqual({ label: 'Send now', childText: 'Send now' });

    const input = page
      .getByRole('treeitem', { name: 'Select Input', exact: true })
      .first();
    await input.click();
    await page.getByLabel('Field type', { exact: true }).selectOption('select');
    await expect(
      page.getByRole('button', { name: '+ Add option', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: '+ Add option', exact: true }).click();
    await page.getByLabel('Option 3 label', { exact: true }).fill('Enterprise');
    await page.getByLabel('Option 3 value', { exact: true }).fill('enterprise');
    await page.getByRole('button', { name: 'Move option 3 up', exact: true }).click();
    await page.getByRole('button', { name: 'Remove option 3', exact: true }).click();

    const quoteParent = page
      .getByRole('treeitem', { name: 'Select Container', exact: true })
      .first();
    await quoteParent.click();
    const addContent = page.getByLabel('Add content to Container', { exact: true });
    await addContent.selectOption('quote');
    await addContent
      .locator('..')
      .getByRole('button', { name: 'Add', exact: true })
      .click();
    await page.getByLabel('Quote', { exact: true }).fill('Clarity compounds.');
    await page.getByLabel('Attribution', { exact: true }).fill('The team');

    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.locator('.builder-save-status')).toContainText('Saved', {
      timeout: 15_000,
    });
    await page.reload();
    await expect(page.locator('.builder-editor-host iframe.gjs-frame')).toBeAttached({
      timeout: 15_000,
    });
    await expect.poll(async () => (await readPayload(page))?.version).toBe(8);

    const reloaded = await readPayload(page);
    const reloadedButton = reloaded && findNode(reloaded.root, 'button');
    const reloadedControl = reloaded && findNode(reloaded.root, 'select');
    const reloadedQuote = reloaded && findNode(reloaded.root, 'quote');
    expect(reloadedButton?.props.label).toBe('Send now');
    expect(
      reloadedButton?.children.find((child) => child.type === 'text')?.props.text,
    ).toBe('Send now');
    expect(reloadedControl?.props).toMatchObject({ type: 'select', name: 'name' });
    expect(reloadedControl?.props.options).toEqual([
      { label: 'Option 1', value: 'option-1' },
      { label: 'Enterprise', value: 'enterprise' },
    ]);
    expect(reloaded.behaviors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'field',
          controlNodeId: reloadedControl?.id,
          inputType: 'select',
        }),
      ]),
    );
    expect(reloadedQuote?.props).toMatchObject({
      text: 'Clarity compounds.',
      cite: 'The team',
    });
    expect(reloadedQuote?.props.citation).toBeUndefined();
  } finally {
    await temporaryPage.dispose();
  }
});
