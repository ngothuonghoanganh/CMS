import { fileURLToPath } from 'node:url';
import { type Cookie, expect, type Page, test } from '@playwright/test';
import { animationsSettled } from '../support/axe.js';
import { type Board, seedBoard } from '../support/board.js';
import { Editor } from '../support/editor.js';
import { siteOrigin } from '../urls.js';

/*
 * Captures each implemented screen at the size of its board (docs/design/plp-ux-v1/screens,
 * canvas.json) with the board's data, for a side-by-side look. See visual.config.ts.
 */

const CAPTURES = fileURLToPath(new URL('../visual-captures/', import.meta.url));

let board: Board;
let session: Cookie[];

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  board = await seedBoard(context.request);
  session = (await context.storageState()).cookies;
  await context.close();
});

test.beforeEach(async ({ context }) => {
  await context.addCookies(session);
});

async function capture(page: Page, board: string): Promise<void> {
  await animationsSettled(page);
  await page.screenshot({ path: `${CAPTURES}${board}.png`, fullPage: true });
}

function sitePath(path = ''): string {
  return `/sites/${board.site.id}${path}`;
}

test.describe('Design capture', () => {
  test('01 Main and the sidebar', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.goto(sitePath());
    await expect(page.getByRole('row').filter({ hasText: 'Tri ân khách hàng 2025' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Hoạt động xuất bản gần đây' })).toBeVisible();
    await capture(page, 'Main');

    await page.setViewportSize({ width: 1440, height: 900 });
    await animationsSettled(page);
    await page
      .getByRole('navigation', { name: 'Điều hướng chính' })
      .screenshot({ path: `${CAPTURES}Sidebar.png` });
  });

  test('02 Onboarding', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.goto(sitePath('/pages/new'));
    await page.getByRole('radio', { name: 'Thu lead tư vấn' }).check();
    await expect(page.getByRole('complementary', { name: 'Trang sẽ gồm' })).toBeVisible();
    await capture(page, 'Onboarding');
    await page.getByRole('button', { name: 'Tiếp tục' }).click();
    await page
      .getByLabel('Ưu đãi hoặc dịch vụ chính · tùy chọn')
      .fill('Niềng răng trong suốt — tư vấn miễn phí tháng 11');
    await capture(page, 'Onboarding-step2');
  });

  test('03 Editor and 04 AddSection', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1080 });
    const editor = new Editor(page);
    await editor.goto(board.site.id, board.pages.promo.id);
    await editor.heroRow.click();
    await expect(editor.heroPanel).toBeVisible();
    await capture(page, 'Editor');

    await editor.structure.getByRole('button', { name: 'Thêm section', exact: true }).click();
    const add = page.getByRole('dialog', { name: 'Thêm section' });
    await add.getByRole('button', { name: /^Bằng chứng xã hội/ }).click();
    await add.getByRole('button', { name: /^Nhận xét dạng thẻ/ }).click();
    await capture(page, 'AddSection');
  });

  test('05 Publish', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const editor = new Editor(page);
    await editor.goto(board.site.id, board.pages.promo.id);
    const dialog = await editor.openPublishDialog();
    await expect(dialog.getByRole('button', { name: 'Sửa ngay' }).first()).toBeVisible();
    await capture(page, 'Publish');
  });

  test('06 History', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(sitePath(`/pages/${board.pages.promo.id}/history`));
    const v2 = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: 'v2', exact: true }) });
    await v2.getByRole('button', { name: 'Khôi phục bản này' }).click();
    const panel = page.getByRole('region', { name: 'Khôi phục v2 thành bản live?' });
    await panel.getByRole('textbox', { name: /^Lý do/ }).fill('Giá ưu đãi mới chưa được duyệt');
    await capture(page, 'History');
  });

  test('07 SEO and 08 Domain', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(sitePath(`/pages/${board.pages.promo.id}/seo`));
    await expect(
      page.getByText('Niềng răng trong suốt – Tư vấn miễn phí | Smile Care').first(),
    ).toBeVisible();
    await capture(page, 'SEO');
    await page.goto(sitePath('/domain'));
    await expect(page.getByRole('heading', { level: 1, name: 'Tên miền' })).toBeVisible();
    await capture(page, 'Domain');
  });

  test('09 PublicPage', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 1720 } });
    const visitor = await context.newPage();
    await visitor.goto(`${siteOrigin(board.site.subdomain)}/uu-dai-thang-11`, {
      waitUntil: 'networkidle',
    });
    // A promotion page's form is named by its heading, "Nhận ưu đãi trước khi hết hạn".
    const form = visitor.locator('form[action="/_lead"]');
    await form.getByRole('textbox', { name: 'Họ và tên' }).fill('Nguyễn Thu Hà');
    await form.getByRole('textbox', { name: 'Số điện thoại' }).fill('090123456');
    await form.getByRole('button').click();
    await expect(form.getByRole('textbox', { name: 'Số điện thoại' })).toBeFocused();
    await visitor.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await capture(visitor, 'PublicPage');
    await context.close();
  });

  test('10 Leads, 11 Analytics and 12 Consent', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const name = 'Nguyễn Thu Hà';
    await page.goto(sitePath(`/leads?lead=${board.leads.get(name) ?? ''}`));
    await expect(
      page.getByRole('complementary', { name }).getByText(/Nội dung đồng ý bản 2/),
    ).toBeVisible();
    await capture(page, 'Leads');

    await page.goto(sitePath('/analytics'));
    await expect(page.getByRole('term').filter({ hasText: 'Lượt xem' })).toBeVisible();
    await capture(page, 'Analytics');

    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.goto(sitePath('/privacy'));
    await expect(
      page.getByRole('region', { name: 'Yêu cầu từ người gửi form' }).getByRole('row').nth(1),
    ).toBeVisible();
    await capture(page, 'Consent');
  });

  test('17 TemplateLibrary and 18 TemplateDetail', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1080 });
    const workspace = `/workspaces/${board.site.workspaceId}`;
    await page.goto(`${workspace}/templates`);
    await expect(page.getByRole('article').first()).toBeVisible();
    await capture(page, 'TemplateLibrary');
    await page.goto(`${workspace}/templates/nha-khoa-uu-dai?site=${board.site.id}`);
    await expect(page.getByRole('region', { name: /^Bản xem trước/ })).toBeVisible();
    await capture(page, 'TemplateDetail');
    await page.getByRole('button', { name: 'Tạo trang từ mẫu' }).click();
    await expect(page.getByRole('dialog', { name: 'Tạo trang từ mẫu' })).toBeVisible();
    await capture(page, 'TemplateDetail-create');
  });
});
