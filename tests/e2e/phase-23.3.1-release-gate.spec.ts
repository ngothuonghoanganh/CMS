import { expect } from '@playwright/test';

import { openCanonicalBuilder, test } from './fixtures/canonical-environment';
import { E2E_RENDERER_ORIGIN } from './fixtures/urls';

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

test('passes the Phase 23.3.1 Builder-to-public release journey', async ({
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
    'phase-23-3-1-release-gate',
  );

  try {
    await page.getByRole('button', { name: 'Contact Form add', exact: true }).click();
    await expect.poll(async () => (await readPayload(page))?.version).toBe(8);
    await page.getByRole('button', { name: 'Layers', exact: true }).click();

    const fieldLayer = page
      .getByRole('treeitem', { name: 'Select Form field', exact: true })
      .first();
    await fieldLayer.click();
    await expect(page.getByLabel('Field label', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Field type', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Required field', { exact: true })).toBeVisible();
    await page.getByLabel('Required field', { exact: true }).check();
    await page.getByLabel('Field label', { exact: true }).fill('Plan');
    await page.getByLabel('Field label', { exact: true }).blur();
    await page.getByLabel('Field type', { exact: true }).selectOption('select');
    await expect(page.getByLabel('Placeholder', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Option 1 label', { exact: true })).toBeVisible();

    const option1Label = page.getByLabel('Option 1 label', { exact: true });
    await option1Label.click();
    await option1Label.selectText();
    await option1Label.pressSequentially('Basic');
    await expect(option1Label).toBeFocused();
    const option1Value = page.getByLabel('Option 1 value', { exact: true });
    await option1Value.click();
    await option1Value.selectText();
    await option1Value.pressSequentially('basic');
    await expect(option1Value).toBeFocused();

    const option2Label = page.getByLabel('Option 2 label', { exact: true });
    await option2Label.click();
    await option2Label.selectText();
    await option2Label.pressSequentially('Enterprise');
    await expect(option2Label).toBeFocused();
    const option2Value = page.getByLabel('Option 2 value', { exact: true });
    await option2Value.click();
    await option2Value.selectText();
    await option2Value.pressSequentially('enterprise');
    await expect(option2Value).toBeFocused();

    // Validation compares the same normalized semantic value used by
    // persistence, while both inputs retain their raw draft text.
    await option1Value.click();
    await option1Value.selectText();
    await option1Value.pressSequentially('A B');
    await expect(option1Value).toBeFocused();
    await option2Value.click();
    await option2Value.selectText();
    await option2Value.pressSequentially('a-b');
    await expect(option2Value).toBeFocused();
    await expect(
      page.locator('.builder-options-editor [role="alert"]').filter({
        hasText: 'This option already uses that value.',
      }),
    ).toHaveCount(2);
    await option1Value.selectText();
    await option1Value.pressSequentially('basic');
    await option2Value.click();
    await option2Value.selectText();
    await option2Value.pressSequentially('enterprise');
    await expect(option2Value).toBeFocused();

    // Casing-only differences are also conflicts under the canonical rule.
    await option1Value.click();
    await option1Value.selectText();
    await option1Value.pressSequentially('Enterprise');
    await option2Value.click();
    await option2Value.selectText();
    await option2Value.pressSequentially('enterprise');
    await expect(
      page.locator('.builder-options-editor [role="alert"]').filter({
        hasText: 'This option already uses that value.',
      }),
    ).toHaveCount(2);
    await option1Value.selectText();
    await option1Value.pressSequentially('basic');
    await option2Value.click();
    await option2Value.selectText();
    await option2Value.pressSequentially('enterprise');
    await expect(option2Value).toBeFocused();

    // A transient blank draft keeps its row and focus while the semantic
    // projection reports the authoring issue.
    await option2Label.click();
    await option2Label.selectText();
    await option2Label.press('Backspace');
    await expect(option2Label).toBeFocused();
    await expect(
      page.locator('.builder-options-editor [role="alert"]').filter({
        hasText: 'Add a label for this option.',
      }),
    ).toBeVisible();
    await option2Label.pressSequentially('Enterprise');
    await expect(option2Label).toBeFocused();

    // Duplicate values are visible feedback, not an accidental editor state.
    await option2Value.click();
    await option2Value.selectText();
    await option2Value.pressSequentially('basic');
    await expect(option2Value).toBeFocused();
    await expect(
      page.locator('.builder-options-editor [role="alert"]').filter({
        hasText: 'This option already uses that value.',
      }),
    ).toHaveCount(2);
    await option2Value.selectText();
    await option2Value.pressSequentially('enterprise');
    await expect(option2Value).toBeFocused();

    await page.getByRole('button', { name: '+ Add option', exact: true }).click();
    await page.getByRole('button', { name: 'Move option 3 up', exact: true }).click();
    await page.getByRole('button', { name: 'Remove option 2', exact: true }).click();
    await expect(page.getByLabel('Option 1 label', { exact: true })).toHaveValue('Basic');
    await expect(page.getByLabel('Option 2 label', { exact: true })).toHaveValue(
      'Enterprise',
    );

    // Save a genuinely new value while the input still owns focus. The
    // focused draft must survive the browser's click/blur event order.
    const focusedOptionValue = page.getByLabel('Option 2 value', { exact: true });
    await focusedOptionValue.click();
    await focusedOptionValue.selectText();
    await focusedOptionValue.pressSequentially('enterprise-plan');
    await expect(focusedOptionValue).toBeFocused();
    const saveResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/pages/${temporaryPage.id}/versions`) &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    const saveResponse = await saveResponsePromise;
    expect(saveResponse.status()).toBe(201);
    const savedVersion = (await saveResponse.json()) as {
      payload?: BuilderPayload;
    };
    const savedField =
      savedVersion.payload && findNode(savedVersion.payload.root, 'form-field');
    const savedControl = savedField?.children.find((child) =>
      ['input', 'textarea', 'select'].includes(child.type),
    );
    expect(savedControl?.props.options).toEqual([
      { label: 'Basic', value: 'basic' },
      { label: 'Enterprise', value: 'enterprise-plan' },
    ]);
    await expect(page.locator('.builder-save-status')).toContainText('Saved', {
      timeout: 15_000,
    });

    let payload = await readPayload(page);
    let field = payload && findNode(payload.root, 'form-field');
    let control = field?.children.find((child) =>
      ['input', 'textarea', 'select'].includes(child.type),
    );
    expect(field?.children.find((child) => child.type === 'label')?.props.text).toBe(
      'Plan',
    );
    expect(control?.type).toBe('select');
    expect(control?.props.options).toEqual([
      { label: 'Basic', value: 'basic' },
      { label: 'Enterprise', value: 'enterprise-plan' },
    ]);

    const canvas = page.frameLocator('iframe.gjs-frame');
    const canvasSelect = canvas.locator('select[data-payload-node-type="select"]');
    const selectPlaceholder =
      typeof control?.props.placeholder === 'string' && control.props.placeholder
        ? control.props.placeholder
        : 'Select an option';
    await expect(canvasSelect.locator('option')).toHaveText([
      selectPlaceholder,
      'Basic',
      'Enterprise',
    ]);
    await expect(canvasSelect.locator('option[value="enterprise-plan"]')).toHaveCount(1);

    await page.getByLabel('Field type', { exact: true }).selectOption('radio');
    await expect(
      canvas.locator('[data-payload-node-type="input"] [role="radiogroup"]'),
    ).toContainText('Basic');
    await expect(
      canvas.locator('[data-payload-node-type="input"] [role="radiogroup"]'),
    ).toContainText('Enterprise');
    await expect(
      canvas.locator(
        '[data-payload-node-type="input"] input[type="radio"][value="enterprise-plan"]',
      ),
    ).toHaveCount(1);

    await fieldLayer.click();
    for (const action of [
      'Duplicate Label',
      'Remove Label',
      'Move Label up',
      'Move Label down',
      'Duplicate Input',
      'Remove Input',
      'Move Input up',
      'Move Input down',
    ]) {
      await expect(page.getByRole('button', { name: action, exact: true })).toHaveCount(
        0,
      );
    }
    await page
      .getByRole('treeitem', { name: 'Select Label', exact: true })
      .first()
      .click();
    await expect(
      page.getByText('This control is managed by its Form Field.', { exact: false }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Edit Form Field', exact: true }).click();

    const containerLayer = page
      .getByRole('treeitem', { name: 'Select Container', exact: true })
      .first();
    await containerLayer.click();
    const addContent = page.getByLabel('Add content to Container', { exact: true });
    await addContent.selectOption('icon');
    await addContent
      .locator('..')
      .getByRole('button', { name: 'Add', exact: true })
      .click();
    await page
      .getByRole('treeitem', { name: 'Select Icon', exact: true })
      .first()
      .click();
    await expect(
      canvas.locator(
        '[data-payload-node-type="icon"] svg[data-payload-icon="arrow-right"]',
      ),
    ).toHaveCount(2);
    await page.getByLabel('Icon', { exact: true }).selectOption('check');
    await expect(
      canvas.locator('[data-payload-node-type="icon"] svg[data-payload-icon="check"]'),
    ).toHaveCount(1);
    await expect(
      canvas.locator(
        '[data-payload-node-type="icon"] svg[data-payload-icon="arrow-right"]',
      ),
    ).toHaveCount(1);

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
    const poster = page.getByLabel('Poster image URL', { exact: true });
    await poster.fill('/assets/poster-a.png');
    await poster.blur();
    await expect(canvas.locator('video[poster="/assets/poster-a.png"]')).toBeVisible();
    await poster.fill('/assets/poster-b.png');
    await poster.blur();
    await expect(canvas.locator('video[poster="/assets/poster-b.png"]')).toBeVisible();
    await poster.fill('');
    await poster.blur();
    await expect(canvas.locator('video[poster]')).toHaveCount(0);
    await poster.fill('/assets/poster-b.png');
    await poster.blur();

    payload = await readPayload(page);
    field = payload && findNode(payload.root, 'form-field');
    control = field?.children.find((child) =>
      ['input', 'textarea', 'select'].includes(child.type),
    );
    expect(control?.type).toBe('input');
    expect(control?.props).toMatchObject({
      type: 'radio',
      options: [
        { label: 'Basic', value: 'basic' },
        { label: 'Enterprise', value: 'enterprise-plan' },
      ],
    });
    expect(findNode(payload!.root, 'icon')?.props.name).toBe('check');
    expect(findNode(payload!.root, 'video')?.props.poster).toBe('/assets/poster-b.png');

    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.locator('.builder-save-status')).toContainText('Saved', {
      timeout: 15_000,
    });
    await page.reload();
    await expect(page.locator('.builder-editor-host iframe.gjs-frame')).toBeAttached({
      timeout: 15_000,
    });
    await expect.poll(async () => (await readPayload(page))?.version).toBe(8);

    payload = await readPayload(page);
    field = payload && findNode(payload.root, 'form-field');
    control = field?.children.find((child) =>
      ['input', 'textarea', 'select'].includes(child.type),
    );
    expect(field?.children.find((child) => child.type === 'label')?.props.text).toBe(
      'Plan',
    );
    expect(control?.props.options).toEqual([
      { label: 'Basic', value: 'basic' },
      { label: 'Enterprise', value: 'enterprise-plan' },
    ]);
    expect(findNode(payload!.root, 'icon')?.props.name).toBe('check');
    expect(findNode(payload!.root, 'video')?.props.poster).toBe('/assets/poster-b.png');
    await expect(
      page
        .frameLocator('iframe.gjs-frame')
        .locator('[data-payload-node-type="input"] [role="radiogroup"]')
        .filter({ hasText: 'Enterprise' }),
    ).toBeVisible();
    await expect(
      page
        .frameLocator('iframe.gjs-frame')
        .locator(
          '[data-payload-node-type="input"] input[type="radio"][value="enterprise-plan"]',
        ),
    ).toHaveCount(1);
    await expect(
      page
        .frameLocator('iframe.gjs-frame')
        .locator('[data-payload-node-type="icon"] svg[data-payload-icon="check"]'),
    ).toBeVisible();
    await expect(
      page
        .frameLocator('iframe.gjs-frame')
        .locator('video[poster="/assets/poster-b.png"]'),
    ).toBeVisible();

    const previewPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Live preview', exact: true }).click();
    const preview = await previewPromise;
    try {
      preview.setDefaultTimeout(5_000);
      preview.setDefaultNavigationTimeout(15_000);
      await preview.waitForLoadState('domcontentloaded');
      await expect(preview.locator('.preview-banner')).toBeVisible();
      await expect(preview.locator('label').filter({ hasText: 'Plan' })).toBeVisible();
      await expect(preview.getByRole('radio', { name: 'Basic' })).toBeVisible();
      await expect(preview.getByRole('radio', { name: 'Enterprise' })).toBeVisible();
      await expect(
        preview.locator('input[type="radio"][value="enterprise-plan"]'),
      ).toHaveCount(1);
      await expect(preview.locator('svg[data-payload-icon="check"]')).toBeVisible();
      await expect(preview.locator('video[poster="/assets/poster-b.png"]')).toBeVisible();
    } finally {
      await preview.close();
    }

    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(
      page.getByText('Page published. The public site now uses the published snapshot.', {
        exact: true,
      }),
    ).toBeVisible({
      timeout: 15_000,
    });

    const publicPage = await browser.newPage({ baseURL: E2E_RENDERER_ORIGIN });
    try {
      publicPage.setDefaultTimeout(5_000);
      publicPage.setDefaultNavigationTimeout(15_000);
      await publicPage.goto(`/${canonicalEnvironment.siteSlug}/${temporaryPage.slug}`);
      const publicForm = publicPage.locator('form[data-payload-node-type="form"]');
      await expect(publicForm.locator('label').filter({ hasText: 'Plan' })).toBeVisible();
      const publicRadios = publicForm.locator('input[type="radio"]');
      await expect(publicRadios).toHaveCount(2);
      await expect(publicRadios.first()).toHaveJSProperty('required', true);
      await expect(publicPage.locator('svg[data-payload-icon="check"]')).toBeVisible();
      await expect(
        publicPage.locator('video[poster="/assets/poster-b.png"]'),
      ).toBeVisible();
      await expect(publicForm.locator('input[value="enterprise-plan"]')).toHaveCount(1);
      const submitButton = publicForm.getByRole('button', {
        name: 'Submit',
        exact: true,
      });
      await expect(submitButton).toHaveAttribute('type', 'submit');
      await submitButton.click();
      expect(
        await publicRadios
          .first()
          .evaluate((input) => (input as HTMLInputElement).validity.valueMissing),
      ).toBe(true);
      await publicForm.getByRole('radio', { name: 'Enterprise' }).check();
      await publicForm.locator('input[type="email"]').fill('phase-23-3-1@example.com');
      const planBehavior = payload?.behaviors.find(
        (behavior) => behavior.kind === 'field' && behavior.nodeId === field?.id,
      );
      const planFieldKey =
        planBehavior && typeof planBehavior.fieldKey === 'string'
          ? planBehavior.fieldKey
          : undefined;
      expect(planFieldKey).toBeTruthy();
      const submissionRequest = publicPage.waitForRequest(
        (request) =>
          request.url().includes('/submissions') && request.method() === 'POST',
        { timeout: 15_000 },
      );
      const submissionResponse = publicPage.waitForResponse(
        (response) => response.url().includes('/submissions'),
        { timeout: 15_000 },
      );
      await submitButton.click();
      const request = await submissionRequest;
      expect(request.postDataJSON()).toEqual(
        expect.objectContaining({
          values: expect.arrayContaining([
            { fieldId: planFieldKey, value: 'enterprise-plan' },
          ]),
        }),
      );
      const response = await submissionResponse;
      expect(response.ok(), await response.text()).toBeTruthy();
      await expect(publicPage.getByRole('status')).toContainText('Thanks');
      await expect(
        publicPage.locator('video[poster="/assets/poster-b.png"]'),
      ).toBeVisible();
    } finally {
      await publicPage.close();
    }
  } finally {
    await temporaryPage.dispose();
  }
});
