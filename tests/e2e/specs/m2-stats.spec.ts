import { DEFAULT_PAGE_MOTION } from '@plp/contracts';
import { expect, type Page, test } from '@playwright/test';
import { expectAccessible } from '../support/axe.js';
import { saveDraftViaApi } from '../support/board.js';
import { Editor } from '../support/editor.js';
import { createPageViaApi, setUpSite, uniqueId } from '../support/setup.js';
import { siteOrigin } from '../urls.js';

/*
 * M2 (ADR-032): "Số liệu nổi bật". Its figures are facts only the business knows, so they start
 * empty and publishing waits for them; on a page that moves, each figure counts up to its value
 * once, while screen readers read the value itself.
 */

const FIGURES = ['12', '8.000+', '4,9/5'];

async function addStats(page: Page, editor: Editor) {
  await editor.structure.getByRole('button', { name: 'Thêm section', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Thêm section' });
  await dialog
    .getByRole('navigation', { name: 'Nhóm section' })
    .getByRole('button', { name: /^Bằng chứng xã hội/ })
    .click();
  await dialog.getByRole('button', { name: /^Số liệu nổi bật/ }).click();
  await dialog.getByRole('button', { name: 'Thêm “Số liệu nổi bật”' }).click();
  await expect(dialog).toBeHidden();
}

test.describe('M2 · stats', () => {
  test('add the figures, publish them, and see them count up once on the live page', async ({
    page,
    browser,
  }) => {
    const { site } = await setUpSite(page.request);
    const slug = `so-lieu-${uniqueId()}`;
    const created = await createPageViaApi(page.request, site.id, {
      title: 'Tẩy trắng răng',
      slug,
      start: {
        kind: 'goal',
        goal: 'product',
        brief: { offer: 'Tẩy trắng răng an toàn', audience: '', phone: '0901 234 567' },
        style: 'calm',
      },
    });
    await saveDraftViaApi(page.request, created.page, (draft) => ({
      composition: { ...draft.composition, motion: { ...DEFAULT_PAGE_MOTION, style: 'smooth' } },
    }));

    const editor = new Editor(page);
    await editor.goto(site.id, created.page.id);
    await addStats(page, editor);

    // The figures start empty: publishing names each one still to fill in.
    const dialog = await editor.openPublishDialog();
    await expect(dialog.getByText('chưa có con số', { exact: false }).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // Typed on the canvas, where each empty figure says what goes there.
    const figures = editor.canvas.locator('[data-placeholder="Con số"]');
    await expect(figures).toHaveCount(FIGURES.length);
    for (const [index, value] of FIGURES.entries()) {
      await figures.nth(index).click();
      await figures.nth(index).fill(value);
      await figures.nth(index).press('Enter');
    }
    await editor.expectSaved();
    await editor.publish(1, 'Thêm số liệu nổi bật');

    const context = await browser.newContext({ viewport: { width: 1280, height: 640 } });
    const visitor = await context.newPage();
    await visitor.goto(`${siteOrigin(site.subdomain)}/${slug}`);
    const stats = visitor.locator('[data-section-type="stats"]');
    const shown = stats.locator('[data-m-count]');
    // What screen readers read beside each figure drawn.
    const spoken = stats.locator('[data-m-count] + span');
    await expect(stats).toHaveAttribute('data-motion', 'wait');
    await expect(shown).toHaveText(FIGURES);

    await stats.scrollIntoViewIfNeeded();
    // Counting: the figures drawn start below their values, then end on them exactly, while
    // screen readers only ever read the values themselves.
    await expect(shown.nth(1)).not.toHaveText('8.000+');
    await expect(spoken).toHaveText(FIGURES);
    await expect(stats).not.toHaveAttribute('data-motion', { timeout: 5000 });
    await expect(shown).toHaveText(FIGURES);
    await expect(spoken).toHaveText(FIGURES);
    await expectAccessible(visitor, 'M2 · số liệu nổi bật · 1280 px');
    await context.close();
  });
});
