import { expect, type Locator, type Page } from '@playwright/test';

/*
 * The AI screens (ADR-031). The E2E API runs `AI_PROVIDER=fake` (playwright.config.ts): fixed
 * Vietnamese copy, written at once, the Hero of a new page headed with the brief's product.
 */

/** The product of the brief, which also names the page until the name is edited. */
export const AI_PRODUCT = 'Niềng răng trong suốt Invisalign';

/** Fills the brief of "Tạo trang bằng AI" (board 20) with the page's path. */
export async function fillAiBrief(page: Page, slug: string): Promise<void> {
  await page.getByLabel('Sản phẩm hoặc dịch vụ').fill(AI_PRODUCT);
  await page.getByLabel('Khách hàng mục tiêu').fill('Người đi làm 22–35 tuổi ở TP.HCM');
  await page
    .getByLabel('Điểm khác biệt và thông điệp chính')
    .fill('Bác sĩ nhiều năm kinh nghiệm chỉnh nha. Chụp phim 3D miễn phí.');
  await page.getByRole('radio', { name: 'Chuyên nghiệp' }).check();
  await page
    .getByLabel('Nội dung bạn đã có · tùy chọn')
    .fill('Trả góp 0% trong 12 tháng, không cần thẻ tín dụng.');
  await expect(page.getByLabel('Tên trang')).toHaveValue(AI_PRODUCT);
  await page.getByLabel('Đường dẫn').fill(slug);
  await expect(page.getByText('Đường dẫn này dùng được.')).toBeVisible();
}

/** The editor's "Trợ lý AI" tab (board 21), opened on the selected Hero. */
export async function openAiAssistant(page: Page): Promise<Locator> {
  await page.getByRole('tab', { name: 'Trợ lý AI' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Trợ lý AI' });
  await expect(panel.getByRole('radio', { name: 'Section Hero' })).toBeChecked();
  return panel;
}
