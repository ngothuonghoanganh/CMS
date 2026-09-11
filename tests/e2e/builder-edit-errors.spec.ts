import { expect, openCanonicalBuilder, test } from './fixtures/canonical-environment';

const legacyElements = [
  { label: 'Text', content: 'Text content' },
  { label: 'Heading', content: 'Text content' },
  { label: 'Link', content: 'Link text' },
  { label: 'Divider' },
  { label: 'List', content: 'Ordered list' },
  { label: 'Quote', content: 'Quote' },
  { label: 'Image', content: 'Alt text' },
  { label: 'Video', content: 'Show controls' },
  { label: 'Gallery' },
  { label: 'Button', content: 'Button text' },
  { label: 'Form', content: 'Submit button label' },
  { label: 'Accordion', content: 'Allow multiple open' },
  { label: 'Tabs', content: 'Orientation' },
  { label: 'Dynamic collection', content: 'Empty message' },
  { label: 'Section' },
  { label: 'Container' },
  { label: 'Navigation View', content: 'Orientation' },
] as const;

async function editContent(
  page: import('@playwright/test').Page,
  field: string,
  value: string,
) {
  const control = page.getByLabel(field, { exact: true }).first();
  await expect(control).toBeVisible();
  const tagName = await control.evaluate((element) => element.tagName);
  if (tagName === 'INPUT' && (await control.getAttribute('type')) === 'checkbox') {
    await control.check();
  } else if (tagName === 'SELECT') {
    await control.selectOption({ index: 1 });
  } else {
    await control.fill(value);
    await control.blur();
  }
}

async function editWidth(page: import('@playwright/test').Page) {
  await page.getByRole('tab', { name: 'Style', exact: true }).click();
  const size = page
    .locator('details.builder-inspector-section')
    .filter({ has: page.locator('summary').filter({ hasText: /^Size$/ }) });
  await expect(size).toBeVisible();
  if ((await size.getAttribute('open')) === null) await size.locator('summary').click();
  const width = size.getByLabel('Width', { exact: true });
  await expect(width).toBeVisible();
  await width.fill('80');
  await width.blur();
}

test('builder block content and design edits stay error-free', async ({
  page,
  request,
  canonicalEnvironment,
}) => {
  test.setTimeout(60_000);
  page.setDefaultTimeout(3_000);
  const temporaryPage = await openCanonicalBuilder(
    page,
    request,
    canonicalEnvironment,
    'builder-edit-errors',
  );

  try {
    await page.getByRole('button', { name: 'Add your first section' }).click();
    const failures: string[] = [];
    const pageErrors: string[] = [];
    const failedResponses: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('response', (response) => {
      if (response.url().includes('/api/') && response.status() >= 400) {
        failedResponses.push(`${response.status()} ${response.url()}`);
      }
    });

    for (const element of legacyElements) {
      await page
        .frameLocator('iframe.gjs-frame')
        .locator('[data-payload-node-type="section"]')
        .first()
        .click();
      await page.getByRole('button', { name: 'Add blocks', exact: true }).click();
      await page
        .getByRole('button', { name: `${element.label} add`, exact: true })
        .click();
      try {
        if (element.content) {
          await page.getByRole('tab', { name: 'Content', exact: true }).click();
          await editContent(page, element.content, `Updated ${element.label}`);
        }
        await editWidth(page);
        await page.getByRole('button', { name: 'Save draft', exact: true }).click();
        await expect(page.locator('.builder-save-status')).toContainText('Saved', {
          timeout: 15_000,
        });
        const alerts = (await page.locator('[role="alert"]:visible').allTextContents())
          .map((alert) => alert.trim())
          .filter(Boolean);
        if (alerts.length > 0) failures.push(`${element.label}: ${alerts.join(' | ')}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const alerts = (await page.locator('[role="alert"]:visible').allTextContents())
          .map((alert) => alert.trim())
          .filter(Boolean);
        throw new Error(
          `${element.label}: ${message}\n${JSON.stringify({ alerts, pageErrors, failedResponses })}`,
        );
      }
    }

    expect(failures, JSON.stringify({ failures, pageErrors, failedResponses })).toEqual(
      [],
    );
    expect(pageErrors).toEqual([]);
    expect(failedResponses).toEqual([]);
  } finally {
    await temporaryPage.dispose();
  }
});

test('Open Composition button label updates its rendered content', async ({
  page,
  request,
  canonicalEnvironment,
}) => {
  test.setTimeout(60_000);
  page.setDefaultTimeout(5_000);
  const temporaryPage = await openCanonicalBuilder(
    page,
    request,
    canonicalEnvironment,
    'open-button-edit',
  );

  try {
    await page.getByRole('button', { name: 'Contact Form add', exact: true }).click();
    await page.getByRole('button', { name: 'Layers', exact: true }).click();
    await page
      .getByRole('treeitem', { name: /Button: Submit/ })
      .first()
      .click();
    await page.getByRole('tab', { name: 'Content', exact: true }).click();
    const buttonText = page.getByLabel('Button text', { exact: true });
    await expect(buttonText).toBeVisible();
    await buttonText.fill('Send message');
    await buttonText.blur();
    await expect(
      page
        .frameLocator('iframe.gjs-frame')
        .locator('[data-payload-node-type="button"]')
        .filter({ hasText: 'Send message' })
        .first(),
    ).toBeVisible();
    await page.getByRole('tab', { name: 'Style', exact: true }).click();
    await page.getByText('Background', { exact: true }).click();
    const background = page.getByLabel('Background color hex value', { exact: true });
    await background.fill('#123456');
    await background.blur();
    await expect(background).not.toHaveAttribute('aria-invalid', 'true');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.locator('.builder-save-status')).toContainText('Saved', {
      timeout: 15_000,
    });
    await page.reload();
    const reloadedButton = page
      .frameLocator('iframe.gjs-frame')
      .locator('[data-payload-node-type="button"]')
      .filter({ hasText: 'Send message' })
      .first();
    await expect(reloadedButton).toBeVisible();
  } finally {
    await temporaryPage.dispose();
  }
});
