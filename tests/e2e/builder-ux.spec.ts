import { expect, openCanonicalBuilder, test } from './fixtures/canonical-environment';
import type { Page } from '@playwright/test';

async function readRootChildIds(page: Page): Promise<string[]> {
  const payload = await page.evaluate(() => {
    const debug = (
      window as Window & { __payloadBuilderDebug?: { getPayload: () => unknown } }
    ).__payloadBuilderDebug;
    return debug?.getPayload();
  });
  return (
    (payload as { root?: { children?: Array<{ id: string }> } } | undefined)?.root
      ?.children ?? []
  ).map((child) => child.id);
}

test.describe('Builder non-technical UX', () => {
  test('gives an empty page a clear first action', async ({
    page,
    request,
    canonicalEnvironment,
  }) => {
    test.setTimeout(120_000);
    const temporaryPage = await openCanonicalBuilder(
      page,
      request,
      canonicalEnvironment,
      'empty page ux',
    );

    try {
      await expect(page.locator('[data-builder-empty-state]')).toBeVisible();
      await expect(page.getByText('This page is empty', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Add your first section' }).click();
      await expect(
        page
          .frameLocator('iframe.gjs-frame')
          .locator('[data-payload-node-type="section"]'),
      ).toHaveCount(1);
      await expect(page.locator('[data-builder-empty-state]')).toHaveCount(0);
    } finally {
      await temporaryPage.dispose();
    }
  });

  test('keeps content, properties, save, and reload in sync', async ({
    page,
    request,
    canonicalEnvironment,
  }) => {
    test.setTimeout(120_000);
    const temporaryPage = await openCanonicalBuilder(
      page,
      request,
      canonicalEnvironment,
      'edit save reload ux',
    );

    try {
      await page.getByRole('button', { name: 'Add your first section' }).click();
      await page.getByRole('button', { name: 'Heading add', exact: true }).click();
      const canvasHeading = page
        .frameLocator('iframe.gjs-frame')
        .locator('[data-payload-node-type="heading"]')
        .last();
      await expect(canvasHeading).toBeVisible();
      await canvasHeading.click();

      const text = page.getByLabel('Text content', { exact: true });
      await text.fill('A welcoming headline');
      await text.blur();
      await expect(canvasHeading).toHaveText('A welcoming headline');

      await page.getByRole('tab', { name: 'Style', exact: true }).click();
      await page.getByText('Typography', { exact: true }).click();
      const fontSize = page.getByLabel('Font size', { exact: true });
      await fontSize.fill('42');
      await fontSize.blur();
      await expect(fontSize).toHaveValue('42');

      await page.getByRole('button', { name: 'Save draft', exact: true }).click();
      await expect(page.locator('.builder-save-status')).toContainText('Saved', {
        timeout: 15_000,
      });
      await page.getByRole('button', { name: 'Save draft', exact: true }).click();
      await expect(
        page.getByText('Everything is already saved.', { exact: true }),
      ).toBeVisible();

      await page.reload();
      await expect(page.locator('.builder-editor-host iframe.gjs-frame')).toBeAttached({
        timeout: 15_000,
      });
      const reloadedHeading = page
        .frameLocator('iframe.gjs-frame')
        .locator('[data-payload-node-type="heading"]');
      await expect(reloadedHeading).toHaveText('A welcoming headline');
      await reloadedHeading.click();
      await expect(page.getByRole('tab', { name: 'Style', exact: true })).toHaveCount(1);
      await page.getByRole('tab', { name: 'Style', exact: true }).click();
      await page.getByText('Typography', { exact: true }).click();
      await expect(page.getByLabel('Font size', { exact: true })).toHaveValue('42');
    } finally {
      await temporaryPage.dispose();
    }
  });

  test('lets a user undo an accidental delete', async ({
    page,
    request,
    canonicalEnvironment,
  }) => {
    test.setTimeout(120_000);
    const temporaryPage = await openCanonicalBuilder(
      page,
      request,
      canonicalEnvironment,
      'delete undo ux',
    );

    try {
      await page.getByRole('button', { name: 'Add your first section' }).click();
      await page.getByRole('button', { name: 'Heading add', exact: true }).click();
      const heading = page
        .frameLocator('iframe.gjs-frame')
        .locator('[data-payload-node-type="heading"]')
        .last();
      await heading.click();
      await page.getByRole('button', { name: 'Remove selected element' }).click();
      await expect(heading).toHaveCount(0);
      await expect(page.getByText('Deleted Heading.', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Undo', exact: true }).last().click();
      await expect(
        page
          .frameLocator('iframe.gjs-frame')
          .locator('[data-payload-node-type="heading"]'),
      ).toHaveCount(1);
    } finally {
      await temporaryPage.dispose();
    }
  });

  test('supports reordering sections from Layers with a visible drop target', async ({
    page,
    request,
    canonicalEnvironment,
  }) => {
    test.setTimeout(120_000);
    const temporaryPage = await openCanonicalBuilder(
      page,
      request,
      canonicalEnvironment,
      'layers reorder ux',
    );

    try {
      await page.getByRole('button', { name: 'Add your first section' }).click();
      await page.getByRole('button', { name: 'Section add', exact: true }).click();
      await page.getByRole('button', { name: 'Layers', exact: true }).click();

      const handles = page.getByRole('button', {
        name: 'Drag Section layer',
        exact: true,
      });
      await expect(handles).toHaveCount(2);
      const before = await readRootChildIds(page);
      const [first, second] = before;
      if (!first || !second) throw new Error('Expected two sections before reorder.');
      const source = await handles.nth(0).boundingBox();
      const target = await handles.nth(1).boundingBox();
      expect(source).toBeTruthy();
      expect(target).toBeTruthy();
      if (!source || !target) throw new Error('Section drag handles are not measurable.');

      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
      await page.mouse.down();
      await page.mouse.move(target.x + target.width / 2, target.y + target.height - 2, {
        steps: 8,
      });
      await expect(page.locator('.builder-layer-node.drop-after')).toHaveCount(1);
      await page.mouse.up();
      await page.waitForTimeout(300);

      const after = await readRootChildIds(page);
      expect(after).toEqual([second, first]);
    } finally {
      await temporaryPage.dispose();
    }
  });

  test('makes the active editing size explicit', async ({
    page,
    request,
    canonicalEnvironment,
  }) => {
    test.setTimeout(120_000);
    const temporaryPage = await openCanonicalBuilder(
      page,
      request,
      canonicalEnvironment,
      'responsive viewport ux',
    );

    try {
      await page.getByRole('button', { name: 'Add your first section' }).click();
      const section = page
        .frameLocator('iframe.gjs-frame')
        .locator('[data-payload-node-type="section"]')
        .first();
      await section.click();
      await page.getByRole('tab', { name: 'Style', exact: true }).click();

      await page.getByRole('button', { name: 'Mobile', exact: true }).click();
      await expect(page.locator('[aria-label="Active style viewport"]')).toContainText(
        'Mobile',
      );
      await page.getByRole('button', { name: 'Tablet', exact: true }).click();
      await expect(page.locator('[aria-label="Active style viewport"]')).toContainText(
        'Tablet',
      );
      await page.getByRole('button', { name: 'Desktop', exact: true }).click();
      await expect(page.locator('[aria-label="Active style viewport"]')).toContainText(
        'Desktop',
      );
    } finally {
      await temporaryPage.dispose();
    }
  });
});
