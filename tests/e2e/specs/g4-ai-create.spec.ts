import { expect, test } from '@playwright/test';
import { AI_PRODUCT, fillAiBrief } from '../support/ai.js';
import { expectAccessible, SCAN_VIEWPORTS } from '../support/axe.js';
import { Editor } from '../support/editor.js';
import { setUpSite, uniqueId } from '../support/setup.js';

/*
 * G4 · creating a page with AI (ADR-031, board 20). The E2E API runs `AI_PROVIDER=fake`
 * (playwright.config.ts): fixed Vietnamese copy, written at once, the Hero headed with the product
 * and its figure marked for review; for "AI chọn" it picks "Mượt mà" and zooms in the first section
 * after the Hero (ADR-032).
 */

test.describe('G4 · create a page with AI', () => {
  test('brief, structure and writing open the draft, whose AI sentences the checklist flags', async ({
    page,
  }) => {
    const { site } = await setUpSite(page.request);
    await page.goto(`/sites/${site.id}/pages/new`);
    await page.getByRole('link', { name: 'Tạo bằng AI' }).click();
    await expect(page).toHaveURL(new RegExp(`/sites/${site.id}/pages/new/ai$`));
    await expect(
      page.getByRole('heading', { level: 1, name: 'Kể cho AI về trang bạn cần' }),
    ).toBeVisible();
    await expect(page.getByText('Còn 100/100 lượt tháng này')).toBeVisible();

    // Brief: the board's fields, and the page's name and path.
    await fillAiBrief(page, `nieng-rang-ai-${uniqueId()}`);
    await page.getByRole('button', { name: 'Đề xuất cấu trúc trang' }).click();

    // Structure: the goal's outline, arranged before any use.
    await expect(page.getByRole('heading', { level: 1, name: 'Cấu trúc đề xuất' })).toBeFocused();
    const structure = page.getByRole('list', { name: 'Các section của trang' });
    await expect(structure.getByRole('listitem')).toHaveCount(7);
    await page.getByRole('button', { name: 'Đưa Câu hỏi thường gặp lên' }).click();
    await expect(structure.getByRole('listitem').nth(3)).toContainText('Câu hỏi thường gặp');
    await page.getByRole('button', { name: 'Bỏ Cảm nhận khách hàng' }).click();
    await page.getByRole('button', { name: 'Thêm section' }).click();
    await page.getByRole('menuitem', { name: 'Gọi / Zalo nhanh' }).click();
    await expect(structure.getByRole('listitem').nth(5)).toContainText('Gọi / Zalo nhanh');
    // Motion (ADR-032): "AI chọn", expecting the style a dental clinic suits, still no use.
    const motion = page.getByRole('group', { name: 'Chuyển động' });
    await expect(motion.getByRole('radio', { name: 'AI chọn' })).toBeChecked();
    await expect(motion).toContainText('Dự kiến: Tinh tế · hợp ngành Nha khoa & y tế');
    await expect(page.getByText('Còn 100/100 lượt tháng này')).toBeVisible();

    // Writing: the fake AI writes every section at once, and the editor opens on the draft.
    await page.getByRole('button', { name: 'Viết nội dung · tốn 1 lượt' }).click();
    await expect(page).toHaveURL(/\/pages\/[a-f0-9]{24}\/edit$/);
    const editor = new Editor(page);
    await expect(editor.heroCanvasHeading).toHaveText(AI_PRODUCT);
    await expect(editor.rows).toHaveCount(7);
    await expect(editor.topBar.getByText('Chưa xuất bản', { exact: true })).toBeVisible();
    // The fake AI chose "Mượt mà", and has the first section after the Hero zoom in.
    await expect(
      editor.structure.getByRole('button', { name: 'Chuyển động · Mượt mà' }),
    ).toBeVisible();
    await expect(editor.rows.nth(2)).toContainText('Riêng · Phóng nhẹ');

    // The Hero's figure is a sentence to check: the panel says so, and so does the checklist.
    await editor.heroRow.click();
    // "Mô tả", with its "AI viết · cần kiểm tra" badge while it lasts; not "Mô tả ảnh…".
    const subheading = editor.heroPanel.getByRole('textbox', { name: /^Mô tả(?: ·|$)/ });
    await expect(editor.heroPanel.getByText('AI viết · cần kiểm tra')).toBeVisible();
    let dialog = await editor.openPublishDialog();
    const review = dialog
      .getByRole('listitem')
      .filter({ hasText: 'Câu do AI viết cần kiểm tra trong section “Hero”' });
    await expect(review).toBeVisible();
    await expectAccessible(page, 'Xuất bản với câu AI cần kiểm tra');
    await review.getByRole('button', { name: 'Sửa' }).click();
    await expect(dialog).toBeHidden();
    await expect(subheading).toBeFocused();

    // Once the user writes the sentence, it is theirs: no more warning.
    await subheading.fill('Tư vấn riêng cho từng người, đặt lịch trong tuần.');
    await subheading.blur();
    await editor.expectSaved();
    await expect(editor.heroPanel.getByText('AI viết · cần kiểm tra')).toBeHidden();
    dialog = await editor.openPublishDialog();
    await expect(dialog.getByText(/Câu do AI viết cần kiểm tra/)).toHaveCount(0);
    await page.keyboard.press('Escape');

    // One use of the month went to the page.
    await page.goto(`/sites/${site.id}/pages/new/ai`);
    await expect(page.getByText('Còn 99/100 lượt tháng này')).toBeVisible();
  });

  test('a motion style picked at the structure step is the draft’s, the AI choosing none', async ({
    page,
  }) => {
    const { site } = await setUpSite(page.request);
    await page.goto(`/sites/${site.id}/pages/new/ai`);
    await fillAiBrief(page, `ai-chuyen-dong-${uniqueId()}`);
    await page.getByRole('button', { name: 'Đề xuất cấu trúc trang' }).click();
    const motion = page.getByRole('group', { name: 'Chuyển động' });
    await motion.getByRole('radio', { name: 'Sang trọng' }).check();
    await expect(motion).toContainText('Nội dung hé lộ chậm rãi');
    await page.getByRole('button', { name: 'Viết nội dung · tốn 1 lượt' }).click();
    await expect(page).toHaveURL(/\/pages\/[a-f0-9]{24}\/edit$/);
    const editor = new Editor(page);
    await expect(
      editor.structure.getByRole('button', { name: 'Chuyển động · Sang trọng' }),
    ).toBeVisible();
    await expect(editor.rows.filter({ hasText: 'Riêng ·' })).toHaveCount(0);
  });

  for (const viewport of SCAN_VIEWPORTS) {
    test(`is accessible at ${viewport.width} px: brief with its problems, then the structure`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const { site } = await setUpSite(page.request);
      await page.goto(`/sites/${site.id}/pages/new/ai`);
      await expect(
        page.getByRole('heading', { level: 1, name: 'Kể cho AI về trang bạn cần' }),
      ).toBeVisible();
      await expectAccessible(page, 'Tạo trang bằng AI · brief');

      await page.getByRole('button', { name: 'Đề xuất cấu trúc trang' }).click();
      await expect(page.getByText('Nhập sản phẩm hoặc dịch vụ')).toBeVisible();
      await expectAccessible(page, 'Tạo trang bằng AI · brief chưa đủ');

      await fillAiBrief(page, `ai-a11y-${uniqueId()}`);
      await page.getByRole('button', { name: 'Đề xuất cấu trúc trang' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Cấu trúc đề xuất' })).toBeVisible();
      await expectAccessible(page, 'Tạo trang bằng AI · cấu trúc');
      await page.getByRole('button', { name: 'Thêm section' }).click();
      await expect(page.getByRole('menu')).toBeVisible();
      await expectAccessible(page, 'Tạo trang bằng AI · thêm section');
    });
  }
});
