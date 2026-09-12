import { expect } from '@playwright/test';
import { openCanonicalBuilder, test } from './fixtures/canonical-environment';
import { E2E_API_BASE_URL, E2E_RENDERER_ORIGIN } from './fixtures/urls';

const apiBase = E2E_API_BASE_URL;

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

test('keeps semantic fields, Canvas projections, and public runtime in parity', async ({
  browser,
  page,
  request,
  canonicalEnvironment,
}) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(5_000);
  const temporaryPage = await openCanonicalBuilder(
    page,
    request,
    canonicalEnvironment,
    'phase-23-3-authoring-guardrails',
  );

  try {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const failedResponses: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('response', (response) => {
      if (response.status() >= 400)
        failedResponses.push(`${response.status()} ${response.url()}`);
    });
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.getByRole('button', { name: 'Contact Form add', exact: true }).click();
    await expect.poll(async () => (await readPayload(page))?.version).toBe(8);
    await page.getByRole('button', { name: 'Layers', exact: true }).click();

    const fieldLayer = page
      .getByRole('treeitem', { name: 'Select Form field', exact: true })
      .first();
    await fieldLayer.click();
    await expect(page.getByLabel('Field label', { exact: true })).toBeVisible();
    await page.getByLabel('Field label', { exact: true }).fill('Plan');
    await page.getByLabel('Field label', { exact: true }).blur();
    await page.getByLabel('Field type', { exact: true }).selectOption('select');

    const canvas = page.frameLocator('iframe.gjs-frame');
    const canvasSelect = canvas.locator('select[data-payload-node-type="select"]');
    const selectPayload = await readPayload(page);
    const selectField = selectPayload && findNode(selectPayload.root, 'form-field');
    const selectControl = selectField?.children.find((child) =>
      ['input', 'textarea', 'select'].includes(child.type),
    );
    const selectPlaceholder =
      typeof selectControl?.props.placeholder === 'string' &&
      selectControl.props.placeholder
        ? selectControl.props.placeholder
        : 'Select an option';
    await expect(canvasSelect.locator('option')).toHaveText([
      selectPlaceholder,
      'Option 1',
      'Option 2',
    ]);

    await page.getByRole('button', { name: '+ Add option', exact: true }).click();
    const optionLabel = page.getByLabel('Option 3 label', { exact: true });
    await optionLabel.click();
    await optionLabel.selectText();
    await optionLabel.pressSequentially('Enterprise');
    await expect(optionLabel).toBeFocused();
    const optionValue = page.getByLabel('Option 3 value', { exact: true });
    await optionValue.click();
    await optionValue.selectText();
    await optionValue.pressSequentially('enterprise');
    await expect(optionValue).toBeFocused();
    await page.getByRole('button', { name: 'Move option 3 up', exact: true }).click();
    await expect(canvasSelect.locator('option')).toHaveText([
      selectPlaceholder,
      'Option 1',
      'Enterprise',
      'Option 2',
    ]);

    await page.getByLabel('Field type', { exact: true }).selectOption('radio');
    const canvasRadioGroup = canvas.locator(
      '[data-payload-node-type="input"] [role="radiogroup"]',
    );
    await expect(canvasRadioGroup).toContainText('Enterprise');
    await expect(canvasRadioGroup.locator('label')).toHaveCount(3);

    await page
      .getByRole('treeitem', { name: 'Select Label', exact: true })
      .first()
      .click();
    await expect(
      page.getByRole('button', { name: 'Edit Form Field', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Edit Form Field', exact: true }).click();
    await expect(page.getByLabel('Field label', { exact: true })).toHaveValue('Plan');

    const containerLayer = page
      .getByRole('treeitem', { name: 'Select Container', exact: true })
      .first();
    await containerLayer.click();
    const addContent = page.getByLabel('Add content to Container', { exact: true });
    await expect(addContent.locator('option[value="form-field"]')).toHaveCount(0);

    await addContent.selectOption('icon');
    await addContent
      .locator('..')
      .getByRole('button', { name: 'Add', exact: true })
      .click();
    await page
      .getByRole('treeitem', { name: 'Select Icon', exact: true })
      .first()
      .click();
    await page.getByLabel('Icon', { exact: true }).selectOption('check');
    await expect(
      canvas.locator('[data-payload-node-type="icon"] svg[data-payload-icon="check"]'),
    ).toBeVisible();

    await containerLayer.click();
    await addContent.selectOption('video');
    await addContent
      .locator('..')
      .getByRole('button', { name: 'Add', exact: true })
      .click();
    await page
      .getByRole('treeitem', { name: 'Select Video', exact: true })
      .first()
      .click();
    await page.getByLabel('Video URL', { exact: true }).fill('/assets/demo.mp4');
    await page.getByLabel('Video URL', { exact: true }).blur();
    const posterUrl = page.getByLabel('Poster image URL', { exact: true });
    await posterUrl.fill('/assets/poster-a.png');
    await posterUrl.blur();
    await expect(canvas.locator('video[poster="/assets/poster-a.png"]')).toBeVisible();
    await posterUrl.fill('/assets/poster-b.png');
    await posterUrl.blur();
    await expect(canvas.locator('video[poster="/assets/poster-b.png"]')).toBeVisible();
    await posterUrl.fill('');
    await posterUrl.blur();
    await expect(canvas.locator('video[poster]')).toHaveCount(0);
    await posterUrl.fill('/assets/poster-b.png');
    await posterUrl.blur();

    const payloadBeforeSave = await readPayload(page);
    const field = payloadBeforeSave && findNode(payloadBeforeSave.root, 'form-field');
    expect(field?.children.find((child) => child.type === 'label')?.props.text).toBe(
      'Plan',
    );
    expect(field?.children.find((child) => child.type === 'input')?.props).toMatchObject({
      type: 'radio',
      options: expect.arrayContaining([{ label: 'Enterprise', value: 'enterprise' }]),
    });

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
      page
        .frameLocator('iframe.gjs-frame')
        .locator('[data-payload-node-type="input"] [role="radiogroup"]')
        .filter({ hasText: 'Enterprise' }),
    ).toBeVisible();
    await expect(
      page
        .frameLocator('iframe.gjs-frame')
        .locator('video[poster="/assets/poster-b.png"]'),
    ).toBeVisible();

    const publish = await page.request.post(
      `${apiBase}/pages/${temporaryPage.id}/publish`,
      {
        data: {},
      },
    );
    expect(publish.ok(), await publish.text()).toBeTruthy();
    const publicPage = await browser.newPage({ baseURL: E2E_RENDERER_ORIGIN });
    try {
      await publicPage.goto(`/${canonicalEnvironment.siteSlug}/${temporaryPage.slug}`);
      await expect(publicPage.getByRole('radio', { name: 'Enterprise' })).toBeVisible();
      await expect(publicPage.locator('svg[data-payload-icon="check"]')).toBeVisible();
      await expect(
        publicPage.locator('video[poster="/assets/poster-b.png"]'),
      ).toBeVisible();
    } finally {
      await publicPage.close();
    }

    expect(pageErrors).toEqual([]);
    const mediaFixture404s = failedResponses.filter((entry) =>
      /^404 http:\/\/127\.0\.0\.1:\d+\/assets\/(?:placeholder\.mp4|demo\.mp4|poster-[ab]\.png)$/.test(
        entry,
      ),
    );
    expect(failedResponses).toEqual(mediaFixture404s);
    expect(
      consoleErrors.every((message) => message.includes('404 (Not Found)')),
    ).toBeTruthy();
  } finally {
    await temporaryPage.dispose();
  }
});
