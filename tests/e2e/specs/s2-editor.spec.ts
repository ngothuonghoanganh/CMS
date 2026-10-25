import { expect, test, type Page } from '@playwright/test';
import { Editor } from '../support/editor.js';
import { clinicImage } from '../support/fixtures.js';
import { createPageViaApi, promoPage, setUpSite, uniqueId } from '../support/setup.js';

/** A signed-in owner on the editor of a fresh promotion page (7 sections). */
async function openPromoEditor(page: Page): Promise<Editor> {
  const { site } = await setUpSite(page.request);
  const created = await createPageViaApi(
    page.request,
    site.id,
    promoPage(`uu-dai-${uniqueId()}`, 'Niềng răng trong suốt giảm 30%'),
  );
  const editor = new Editor(page);
  await editor.goto(site.id, created.page.id);
  await expect(editor.rows).toHaveCount(7);
  return editor;
}

test.describe('S2 · editor', () => {
  test('panel and canvas edit the same text, undo/redo, and autosave survives a reload', async ({
    page,
  }) => {
    const editor = await openPromoEditor(page);

    await editor.setHeroHeading('Niềng răng trong suốt — bản 1');

    // Typing on the canvas updates the panel field: one store, one command.
    await editor.heroCanvasHeading.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('Niềng răng trong suốt — bản 2');
    await page.keyboard.press('Tab');
    await expect(editor.heroHeadingField).toHaveValue('Niềng răng trong suốt — bản 2');

    // Undo with the button, redo with the shortcut.
    await editor.topBar.getByRole('button', { name: 'Hoàn tác' }).click();
    await expect(editor.heroCanvasHeading).toHaveText('Niềng răng trong suốt — bản 1');
    await expect(editor.heroHeadingField).toHaveValue('Niềng răng trong suốt — bản 1');
    await page.keyboard.press('ControlOrMeta+Shift+Z');
    await expect(editor.heroCanvasHeading).toHaveText('Niềng răng trong suốt — bản 2');
    await editor.expectSaved();

    await page.reload();
    await expect(editor.heroCanvasHeading).toHaveText('Niềng răng trong suốt — bản 2');
    await expect(editor.topBar.getByRole('button', { name: 'Hoàn tác' })).toBeDisabled();
  });

  test('add a section, move it with buttons and the keyboard, then delete it', async ({ page }) => {
    const editor = await openPromoEditor(page);

    // Insert after the selected Hero.
    await editor.heroRow.click();
    await editor.structure.getByRole('button', { name: 'Thêm section', exact: true }).click();
    const add = page.getByRole('dialog', { name: 'Thêm section' });
    await expect(add.getByText('Chèn sau Hero · vị trí 3 / 8')).toBeVisible();
    await add.getByRole('searchbox', { name: 'Tìm section' }).fill('nhan xet');
    await add.getByRole('button', { name: /^Nhận xét dạng thẻ/ }).click();
    await add.getByRole('button', { name: /^Thêm “/ }).click();
    await expect(add).toBeHidden();
    await expect(editor.rows).toHaveCount(8);
    await expect(editor.rows.nth(2)).toContainText('Cảm nhận khách hàng');
    const inserted = await editor.rowTexts();
    const movedDown = [...inserted];
    [movedDown[2], movedDown[3]] = [inserted[3] ?? '', inserted[2] ?? ''];

    // The canvas toolbar button and Alt+↑ move the selected section.
    await editor.canvasToolbar.getByRole('button', { name: 'Chuyển xuống' }).click();
    await expect.poll(() => editor.rowTexts()).toEqual(movedDown);
    await page.keyboard.press('Alt+ArrowUp');
    await expect.poll(() => editor.rowTexts()).toEqual(inserted);

    // The structure row buttons do the same, and Alt+↓ too.
    await editor.structure
      .getByRole('button', { name: 'Chuyển Cảm nhận khách hàng xuống dưới' })
      .click();
    await expect.poll(() => editor.rowTexts()).toEqual(movedDown);
    await editor.structure
      .getByRole('button', { name: 'Chuyển Cảm nhận khách hàng lên trên' })
      .click();
    await expect.poll(() => editor.rowTexts()).toEqual(inserted);
    await page.keyboard.press('Alt+ArrowDown');
    await expect.poll(() => editor.rowTexts()).toEqual(movedDown);

    // Dragging with the keyboard: pick up with Space, move with ↑, drop with Space. dnd-kit announces
    // each step to screen readers; the next key waits for that announcement.
    const announcement = (text: string) => page.getByRole('status').filter({ hasText: text });
    await editor.rows
      .nth(3)
      .getByRole('button', { name: /^Kéo để sắp xếp/ })
      .focus();
    await page.keyboard.press('Space');
    // Picked up: dnd-kit replaces "Đã nhấc section…" with the position it is over, its own.
    await expect(announcement('Đã chuyển tới vị trí 4 / 8.')).toBeAttached();
    // dnd-kit ignores arrows until it has measured the dragged row, which shows nowhere in the
    // DOM; press again until the move is announced. A press that moved is announced at once.
    await expect(async () => {
      await page.keyboard.press('ArrowUp');
      await expect(announcement('Đã chuyển tới vị trí 3 / 8.')).toBeAttached({ timeout: 1_000 });
    }).toPass({ intervals: [100] });
    await page.keyboard.press('Space');
    await expect(announcement('Đã thả section Cảm nhận khách hàng ở vị trí 3 / 8.')).toBeAttached();
    await expect.poll(() => editor.rowTexts()).toEqual(inserted);

    // Delete it again from the canvas toolbar, after a confirmation.
    await editor.rows
      .nth(2)
      .getByRole('button', { name: /^Cảm nhận khách hàng/ })
      .click();
    await editor.canvasToolbar.getByRole('button', { name: 'Xóa section' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Xóa section Cảm nhận khách hàng?' });
    await confirm.getByRole('button', { name: 'Xóa section' }).click();
    await expect(confirm).toBeHidden();
    await expect(editor.rows).toHaveCount(7);
    await editor.expectSaved();
  });

  test('a section hidden on phones is hidden only in the phone view', async ({ page }) => {
    const editor = await openPromoEditor(page);
    const devices = page.getByRole('group', { name: 'Xem theo thiết bị' });
    const placeholder = editor.canvas.getByText('Lợi ích đang ẩn trên điện thoại.');
    const benefitsHeading = editor.canvas.getByText('Bạn nhận được gì', { exact: true });

    await editor.structure
      .getByRole('button', { name: /^Lợi ích/ })
      .filter({ hasNotText: 'Kéo' })
      .click();
    await devices.getByRole('button', { name: 'Điện thoại' }).click();
    await expect(editor.canvas).toContainText('Điện thoại');
    await editor.canvasToolbar.getByRole('button', { name: 'Ẩn section' }).click();

    await expect(placeholder).toBeVisible();
    await expect(benefitsHeading).toHaveCount(0);
    await expect(editor.rows.nth(2)).toContainText('Ẩn trên điện thoại');

    // Tablets (768 px) and computers use the desktop flag, so the section still shows there.
    await devices.getByRole('button', { name: 'Máy tính bảng' }).click();
    await expect(benefitsHeading).toBeVisible();
    await expect(placeholder).toHaveCount(0);
    await devices.getByRole('button', { name: 'Máy tính', exact: true }).click();
    await expect(benefitsHeading).toBeVisible();
    await editor.expectSaved();

    // The flag is saved with the draft.
    await page.reload();
    await expect(editor.rows.nth(2)).toContainText('Ẩn trên điện thoại');
    await devices.getByRole('button', { name: 'Điện thoại' }).click();
    await expect(placeholder).toBeVisible();
  });

  test('an upload needs a description or the decorative flag, then fills the image field', async ({
    page,
  }) => {
    const editor = await openPromoEditor(page);
    await editor.heroRow.click();
    await editor.heroPanel.getByRole('button', { name: 'Chữ · Ảnh' }).click();
    await editor.heroPanel.getByRole('button', { name: 'Chọn ảnh' }).click();

    const picker = page.getByRole('dialog', { name: 'Chọn ảnh' });
    await picker.getByLabel('Tệp ảnh').setInputFiles(clinicImage);
    await picker.getByRole('button', { name: 'Tải lên và chọn' }).click();
    await expect(
      picker.getByText('Nhập mô tả ảnh hoặc đánh dấu "Ảnh chỉ để trang trí"'),
    ).toBeVisible();

    await picker
      .getByRole('textbox', { name: 'Mô tả ảnh cho người dùng trình đọc màn hình' })
      .fill('Phòng khám sáng sủa');
    await picker.getByRole('button', { name: 'Tải lên và chọn' }).click();
    await expect(picker).toBeHidden();

    await expect(editor.canvas.getByRole('img', { name: 'Phòng khám sáng sủa' })).toBeVisible();
    await expect(
      editor.heroPanel.getByRole('textbox', {
        name: 'Mô tả ảnh cho người dùng trình đọc màn hình',
      }),
    ).toHaveValue('Phòng khám sáng sủa');
    await editor.expectSaved();

    await page.reload();
    await expect(editor.canvas.getByRole('img', { name: 'Phòng khám sáng sủa' })).toBeVisible();
  });
});
