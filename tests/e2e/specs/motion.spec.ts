import {
  type Browser,
  type BrowserContextOptions,
  expect,
  type Locator,
  test,
} from '@playwright/test';
import { fillAiBrief } from '../support/ai.js';
import { Editor } from '../support/editor.js';
import { setUpLeadCaptureViaApi, setUpSite, uniqueId } from '../support/setup.js';
import { siteOrigin } from '../urls.js';

/** A short window, so the questions and the form start below it. */
const VIEWPORT = { width: 1280, height: 640 };

/** Opacity of every part of a section, as the browser draws it now. */
function opacities(section: Locator): Promise<string[]> {
  return section
    .locator('[data-m]')
    .evaluateAll((parts) => parts.map((part) => getComputedStyle(part).opacity));
}

async function visit(browser: Browser, url: string, options: BrowserContextOptions = {}) {
  const context = await browser.newContext({ viewport: VIEWPORT, ...options });
  const page = await context.newPage();
  await page.goto(url);
  return { context, page };
}

/** ARCHITECTURE §5: Chuyển động is done when this whole chain passes in one go. */
test('Chuyển động: AI page with “AI chọn” → publish → another style, a section of its own, play → publish → the live page moves, less motion shows it at once → roll back to the AI’s style', async ({
  page,
  browser,
}) => {
  const { site } = await setUpSite(page.request);
  await setUpLeadCaptureViaApi(page.request, site.id);
  const slug = `chuyen-dong-ai-${uniqueId()}`;

  // 1. "Tạo trang bằng AI", the motion left to the AI: the draft has the style the fake chose.
  await page.goto(`/sites/${site.id}/pages/new/ai`);
  await fillAiBrief(page, slug);
  await page.getByRole('button', { name: 'Đề xuất cấu trúc trang' }).click();
  await expect(
    page.getByRole('group', { name: 'Chuyển động' }).getByRole('radio', { name: 'AI chọn' }),
  ).toBeChecked();
  await page.getByRole('button', { name: 'Viết nội dung · tốn 1 lượt' }).click();
  await expect(page).toHaveURL(/\/pages\/[a-f0-9]{24}\/edit$/);
  const editor = new Editor(page);
  const chosen = editor.structure.getByRole('button', { name: 'Chuyển động · Mượt mà' });
  await expect(chosen).toBeVisible();
  const benefitsRow = editor.rows.nth(2);
  await expect(benefitsRow).toContainText('Riêng · Phóng nhẹ');
  await editor.publish(1, 'Phong cách AI chọn');

  // 2. The editor: another style, a section of its own, then "Chạy thử" and publish.
  await chosen.click();
  const settings = page.getByRole('complementary', { name: 'Cài đặt trang' });
  await settings
    .getByRole('group', { name: 'Phong cách chuyển động' })
    .getByRole('button', { name: /^Năng động/ })
    .click();
  await expect(
    editor.structure.getByRole('button', { name: 'Chuyển động · Năng động' }),
  ).toBeVisible();
  const faqRow = editor.rows.filter({ hasText: 'Câu hỏi thường gặp' }).first();
  await faqRow.getByRole('button', { name: /^Câu hỏi thường gặp/ }).click();
  await page
    .getByRole('complementary', { name: 'Câu hỏi thường gặp' })
    .getByRole('group', { name: 'Cách xuất hiện' })
    .getByRole('button', { name: /^Bật lên/ })
    .click();
  await expect(faqRow).toContainText('Riêng · Bật lên');
  // The AI's own section stays its own under the new style.
  await expect(benefitsRow).toContainText('Riêng · Phóng nhẹ');
  await editor.expectSaved();
  await editor.canvas.getByRole('button', { name: 'Chạy thử hiệu ứng' }).click();
  await expect(page.getByText('Đã chạy thử xong', { exact: false })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole('button', { name: 'Quay lại chỉnh sửa' }).click();
  const dialog = await editor.openPublishDialog();
  await expect(dialog.getByText('Chuyển động: Năng động')).toBeVisible();
  await expect(dialog.getByText('Sửa: Câu hỏi thường gặp')).toBeVisible();
  const done = await editor.publishFromDialog(dialog, 2, 'Năng động hơn');
  await done.getByRole('button', { name: 'Tiếp tục chỉnh sửa' }).click();

  // 3. The live page: a section below the window waits, then enters once the visitor gets there.
  const url = `${siteOrigin(site.subdomain)}/${slug}`;
  const { context, page: visitor } = await visit(browser, url);
  await expect(visitor.locator('[data-motion-root]')).toHaveCount(1);
  await expect(visitor.locator('[data-section-type="benefits"]')).toHaveAttribute(
    'data-motion-enter',
    'zoom',
  );
  const faq = visitor.locator('[data-section-type="faq"]');
  await expect(faq).toHaveAttribute('data-motion-enter', 'pop');
  await expect(faq).toHaveAttribute('data-motion', 'wait');
  expect(new Set(await opacities(faq))).toEqual(new Set(['0']));
  await faq.scrollIntoViewIfNeeded();
  await expect(faq).not.toHaveAttribute('data-motion', { timeout: 5000 });
  expect(new Set(await opacities(faq))).toEqual(new Set(['1']));
  await expect(faq.getByRole('heading', { level: 2 })).toBeVisible();
  await context.close();

  // A device that asks for less motion sees every section at once.
  const still = await visit(browser, url, { reducedMotion: 'reduce' });
  const stillFaq = still.page.locator('[data-section-type="faq"]');
  await expect(stillFaq.getByRole('heading', { level: 2 })).toBeVisible();
  await expect(stillFaq).not.toHaveAttribute('data-motion');
  expect(new Set(await opacities(stillFaq))).toEqual(new Set(['1']));
  await still.context.close();

  // 4. Rolling back to v1 brings the AI's style back to the live page.
  await editor.topBar.getByRole('link', { name: 'Lịch sử phiên bản' }).click();
  const v1 = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'v1', exact: true }) });
  await v1.getByRole('button', { name: 'Khôi phục bản này' }).click();
  const restore = page.getByRole('region', { name: 'Khôi phục v1 thành bản live?' });
  await restore.getByRole('textbox', { name: /^Lý do/ }).fill('Khách thích phong cách AI chọn');
  await restore.getByRole('button', { name: 'Khôi phục v1' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'v1 đang live' })).toBeVisible();
  const back = await visit(browser, url);
  const backFaq = back.page.locator('[data-section-type="faq"]');
  await expect(async () => {
    await back.page.reload();
    // "Mượt mà" slides up; the section the AI changed is its own again.
    await expect(backFaq).toHaveAttribute('data-motion-enter', 'up', { timeout: 1000 });
  }).toPass();
  await expect(back.page.locator('[data-section-type="benefits"]')).toHaveAttribute(
    'data-motion-enter',
    'zoom',
  );
  await back.context.close();
});
