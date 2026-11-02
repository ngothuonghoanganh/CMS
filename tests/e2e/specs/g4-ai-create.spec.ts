import { expect, type Page, test } from '@playwright/test';
import { expectAccessible, SCAN_VIEWPORTS } from '../support/axe.js';
import { Editor } from '../support/editor.js';
import { setUpSite, uniqueId } from '../support/setup.js';

/*
 * G4 · creating a page with AI (ADR-031, board 20). The E2E API runs `AI_PROVIDER=fake`
 * (playwright.config.ts): fixed Vietnamese copy, written at once, the Hero headed with the product
 * and its figure marked for review.
 */

const PRODUCT = 'Niềng răng trong suốt Invisalign';

async function fillBrief(page: Page, slug: string): Promise<void> {
  await page.getByLabel('Sản phẩm hoặc dịch vụ').fill(PRODUCT);
  await page.getByLabel('Khách hàng mục tiêu').fill('Người đi làm 22–35 tuổi ở TP.HCM');
  await page
    .getByLabel('Điểm khác biệt và thông điệp chính')
    .fill('Bác sĩ nhiều năm kinh nghiệm chỉnh nha. Chụp phim 3D miễn phí.');
  await page.getByRole('radio', { name: 'Chuyên nghiệp' }).check();
  await page
    .getByLabel('Nội dung bạn đã có · tùy chọn')
    .fill('Trả góp 0% trong 12 tháng, không cần thẻ tín dụng.');
  await expect(page.getByLabel('Tên trang')).toHaveValue(PRODUCT);
  await page.getByLabel('Đường dẫn').fill(slug);
  await expect(page.getByText('Đường dẫn này dùng được.')).toBeVisible();
}

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
    await fillBrief(page, `nieng-rang-ai-${uniqueId()}`);
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
    await expect(page.getByText('Còn 100/100 lượt tháng này')).toBeVisible();

    // Writing: the fake AI writes every section at once, and the editor opens on the draft.
    await page.getByRole('button', { name: 'Viết nội dung · tốn 1 lượt' }).click();
    await expect(page).toHaveURL(/\/pages\/[a-f0-9]{24}\/edit$/);
    const editor = new Editor(page);
    await expect(editor.heroCanvasHeading).toHaveText(PRODUCT);
    await expect(editor.rows).toHaveCount(7);
    await expect(editor.topBar.getByText('Chưa xuất bản', { exact: true })).toBeVisible();

    // The Hero's figure is a sentence to check: the panel says so, and so does the checklist.
    await editor.heroRow.click();
    const subheading = editor.heroPanel.getByRole('textbox', { name: /^Mô tả/ });
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

      await fillBrief(page, `ai-a11y-${uniqueId()}`);
      await page.getByRole('button', { name: 'Đề xuất cấu trúc trang' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Cấu trúc đề xuất' })).toBeVisible();
      await expectAccessible(page, 'Tạo trang bằng AI · cấu trúc');
      await page.getByRole('button', { name: 'Thêm section' }).click();
      await expect(page.getByRole('menu')).toBeVisible();
      await expectAccessible(page, 'Tạo trang bằng AI · thêm section');
    });
  }
});
