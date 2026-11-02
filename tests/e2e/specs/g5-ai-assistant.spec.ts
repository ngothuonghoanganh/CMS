import { expect, type Page, test } from '@playwright/test';
import { expectAccessible, SCAN_VIEWPORTS } from '../support/axe.js';
import { Editor } from '../support/editor.js';
import { createPageViaApi, promoPage, setUpSite, uniqueId } from '../support/setup.js';

/*
 * G5 · the AI assistant in the editor (ADR-031, board 21). The E2E API runs `AI_PROVIDER=fake`
 * (playwright.config.ts): fixed Vietnamese copy at once, so a Hero rewritten gets the heading
 * "Tiêu đề mới" and a subheading with a figure, flagged for review.
 */

const OFFER = 'Giảm 30% niềng răng trong suốt';
const AI_HEADING = 'Tiêu đề mới';

/** A new owner's promotion page open in the editor, with its Hero selected. */
async function openHero(page: Page): Promise<Editor> {
  const { site } = await setUpSite(page.request);
  const created = await createPageViaApi(
    page.request,
    site.id,
    promoPage(`tro-ly-ai-${uniqueId()}`, OFFER),
  );
  const editor = new Editor(page);
  await editor.goto(site.id, created.page.id);
  await editor.heroRow.click();
  await expect(editor.heroPanel).toBeVisible();
  return editor;
}

/** The "Trợ lý AI" tab, opened. */
async function openAssistant(page: Page) {
  await page.getByRole('tab', { name: 'Trợ lý AI' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Trợ lý AI' });
  await expect(panel.getByRole('radio', { name: 'Section Hero' })).toBeChecked();
  return panel;
}

test.describe('G5 · AI assistant in the editor', () => {
  test('rewrites the Hero, applies it as one step that Ctrl+Z undoes, and spends one use', async ({
    page,
  }) => {
    const editor = await openHero(page);
    const before = await editor.heroCanvasHeading.textContent();
    expect(before).toContain(OFFER);
    const panel = await openAssistant(page);
    await expect(
      panel.getByText('Còn 100/100 lượt tháng này · AI chỉ đọc chữ của bản nháp, không đọc lead.'),
    ).toBeVisible();

    // Suggestions never touch the draft until applied.
    await panel.getByRole('button', { name: 'Viết lại' }).click();
    const result = panel.getByRole('region', { name: 'Gợi ý cho Hero' });
    await expect(result.getByRole('heading', { name: 'Gợi ý cho Hero' })).toBeFocused();
    // Each suggestion reads "Gợi ý: …" to a screen reader; the AI's heading is one of them.
    await expect(result.getByText(AI_HEADING)).toBeVisible();
    await expect(
      result.getByText('Kiểm tra lại: câu này nêu số liệu, giá hay cam kết.').first(),
    ).toBeVisible();
    await expect(editor.heroCanvasHeading).toHaveText(before ?? '');
    await expect(panel.getByText(/^Còn 99\/100 lượt tháng này/)).toBeVisible();

    // One command, one undo step; autosave saves it like any edit.
    await panel.getByRole('button', { name: /^Áp dụng \d+ thay đổi$/ }).click();
    await expect(editor.heroCanvasHeading).toHaveText(AI_HEADING);
    await expect(editor.canvas.getByText(/^Đã áp dụng \d+ thay đổi vào bản nháp$/)).toBeVisible();
    const undo = editor.canvas.getByRole('button', { name: 'Hoàn tác' });
    await expect(undo).toBeFocused();
    await editor.expectSaved();

    await page.keyboard.press('Control+z');
    await expect(editor.heroCanvasHeading).toHaveText(before ?? '');
    await expect(undo).toBeHidden();
    await editor.expectSaved();
    // The use stays spent: the AI answered, the user chose not to keep it.
    await expect(panel.getByText(/^Còn 99\/100 lượt tháng này/)).toBeVisible();
  });

  for (const viewport of SCAN_VIEWPORTS) {
    test(`is accessible at ${viewport.width} px: idle, then a result`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openHero(page);
      const panel = await openAssistant(page);
      await expect(panel.getByRole('button', { name: 'Viết lại' })).toBeEnabled();
      await expectAccessible(page, 'Trợ lý AI · chờ yêu cầu');

      await panel.getByRole('button', { name: 'Viết lại' }).click();
      await expect(panel.getByRole('region', { name: 'Gợi ý cho Hero' })).toBeVisible();
      await expectAccessible(page, 'Trợ lý AI · gợi ý');
    });
  }
});
