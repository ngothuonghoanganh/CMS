import { fileURLToPath } from 'node:url';
import { type Cookie, expect, type Page, test } from '@playwright/test';
import { fillAiBrief, openAiAssistant } from '../support/ai.js';
import { animationsSettled } from '../support/axe.js';
import { type Board, seedBoard } from '../support/board.js';
import { Editor } from '../support/editor.js';
import { accountLink, waitForEmail } from '../support/mailpit.js';
import { uniqueId } from '../support/setup.js';
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

  test('22 Contacts', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(sitePath('/contacts'));
    const list = page.getByRole('region', { name: 'Danh sách khách hàng' });
    const rows = list.getByRole('row');
    await expect(rows.nth(1)).toBeVisible();
    // Tags and an owner on some profiles, as on the board.
    await rows.nth(1).getByRole('checkbox').check();
    await rows.nth(2).getByRole('checkbox').check();
    const bar = page.getByRole('toolbar', { name: 'Thao tác hàng loạt' });
    await bar.getByRole('button', { name: 'Gắn nhãn…' }).click();
    const tagDialog = page.getByRole('dialog', { name: 'Gắn nhãn' });
    await tagDialog.getByRole('combobox', { name: 'Nhãn' }).fill('Niềng răng');
    await tagDialog.getByRole('button', { name: 'Gắn nhãn' }).click();
    await expect(tagDialog).toBeHidden();
    await rows.nth(1).getByRole('checkbox').check();
    await bar.getByRole('button', { name: 'Giao cho…' }).click();
    await page.getByRole('menuitem').first().click();
    await expect(rows.nth(1)).not.toContainText('Chưa giao');
    await capture(page, 'Contacts');

    for (const index of [1, 2, 3]) {
      await rows.nth(index).getByRole('checkbox').check();
    }
    await capture(page, 'Contacts-bulk');
    for (const index of [1, 2, 3]) {
      await rows.nth(index).getByRole('checkbox').uncheck();
    }

    await page.getByRole('button', { name: 'Thêm khách hàng' }).click();
    const add = page.getByRole('dialog', { name: 'Thêm khách hàng' });
    await add.getByRole('textbox', { name: /Họ và tên/ }).fill('Nguyễn Thu Hà');
    await add.getByRole('textbox', { name: /Số điện thoại/ }).fill('0901 234 567');
    await add.getByRole('button', { name: 'Thêm khách hàng' }).click();
    await expect(add.getByRole('status')).toBeVisible();
    await capture(page, 'Contacts-add');
  });

  test('23 ContactProfile', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.goto(sitePath('/contacts'));
    await page
      .getByRole('region', { name: 'Danh sách khách hàng' })
      .getByRole('row')
      .nth(1)
      .getByRole('link')
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // A call noted, two tasks (one overdue, one done) and a meeting, as on the board.
    const composer = page.getByRole('tablist', { name: 'Thêm vào hồ sơ' });
    await composer.getByRole('tab', { name: 'Công việc' }).click();
    const local = (offsetMs: number) =>
      new Date(Date.now() + 7 * 3_600_000 + offsetMs).toISOString().slice(0, 16);
    for (const [title, offset] of [
      ['Gọi lại trong 15 phút', -3 * 24 * 3_600_000],
      ['Gửi bảng giá trả góp qua Zalo', 20 * 3_600_000],
      ['Gọi xác nhận lịch hẹn', -25 * 60_000],
    ] as const) {
      await page.getByRole('textbox', { name: 'Việc cần làm' }).fill(title);
      await page.getByLabel('Hạn', { exact: true }).fill(local(offset));
      await page.getByRole('button', { name: 'Thêm công việc' }).click();
      await expect(page.getByRole('region', { name: 'Công việc' }).getByText(title)).toBeVisible();
    }
    await page
      .getByRole('region', { name: 'Công việc' })
      .getByRole('checkbox', { name: /Gọi lại trong 15 phút/ })
      .check();
    await composer.getByRole('tab', { name: 'Lịch hẹn' }).click();
    await page.getByLabel('Ngày giờ').fill(local(2 * 24 * 3_600_000));
    await page.getByRole('textbox', { name: 'Nơi' }).fill('Chi nhánh Quận 3');
    await page.getByRole('textbox', { name: /Người gặp/ }).fill('BS. Trần Minh');
    await page.getByRole('textbox', { name: /Nội dung hẹn/ }).fill('Khám và chụp phim 3D');
    await page.getByRole('button', { name: 'Đặt lịch hẹn' }).click();
    await expect(page.getByRole('region', { name: 'Lịch hẹn sắp tới' })).toContainText(
      'BS. Trần Minh',
    );
    await composer.getByRole('tab', { name: 'Ghi chú' }).click();
    await page
      .getByRole('textbox', { name: 'Ghi chú' })
      .fill('Quan tâm Invisalign, sợ đau. Hẹn gọi lại sau khi xem bảng giá trả góp.');
    await page.getByRole('button', { name: 'Lưu ghi chú' }).click();
    await expect(page.getByText('Đã lưu ghi chú', { exact: true })).toBeVisible();
    await expect(page.getByText('Đã lưu ghi chú', { exact: true })).toBeHidden({ timeout: 15_000 });
    await capture(page, 'ContactProfile');

    await page.getByRole('button', { name: 'Thao tác dữ liệu' }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await capture(page, 'ContactProfile-menu');
    await page.getByRole('menuitem', { name: 'Xóa dữ liệu của người này' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByText(/lead và bằng chứng đồng ý/)).toBeVisible();
    await capture(page, 'ContactProfile-delete');
    await dialog.getByRole('button', { name: 'Hủy' }).click();
  });

  test('24 Pipeline', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(sitePath('/contacts/pipeline'));
    await expect(page.getByRole('heading', { level: 1, name: 'Cơ hội' })).toBeVisible();
    await capture(page, 'Pipeline');

    const first = page.getByRole('button', { name: /Chuyển giai đoạn/ }).first();
    await first.click();
    await page.getByRole('menuitem', { name: 'Đánh dấu thắng…' }).click();
    await expect(page.getByRole('dialog', { name: 'Đánh dấu thắng' })).toBeVisible();
    await capture(page, 'Pipeline-won');
    await page.getByRole('button', { name: 'Hủy' }).click();

    await first.click();
    await page.getByRole('menuitem', { name: 'Đánh dấu thua…' }).click();
    const lost = page.getByRole('dialog', { name: 'Đánh dấu thua' });
    await lost.getByRole('radio', { name: 'Chọn nơi khác' }).check();
    await lost.getByRole('textbox', { name: /Ghi chú/ }).fill('Chọn phòng khám gần nhà ở Thủ Đức');
    await capture(page, 'Pipeline-lost');
    await lost.getByRole('button', { name: 'Hủy' }).click();

    await page.getByRole('button', { name: 'Danh sách' }).click();
    await expect(page.getByRole('region', { name: 'Danh sách cơ hội' })).toBeVisible();
    await capture(page, 'Pipeline-list');
  });

  test('25 Automations', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(sitePath('/automations'));
    for (const name of [
      'Giao lead mới cho người trực',
      'Nhắc khi lead chưa được gọi',
      'Báo tin khi chốt được khách',
    ]) {
      await page.getByRole('button', { name: new RegExp(name) }).click();
      await expect(
        page.getByRole('region', { name: 'Automation của site' }).getByText(name, { exact: true }),
      ).toBeVisible();
    }
    await page.getByRole('switch', { name: 'Bật Giao lead mới cho người trực' }).check();
    await page.getByRole('switch', { name: 'Bật Nhắc khi lead chưa được gọi' }).check();
    await page.getByRole('switch', { name: 'Bật Nhắc khi lead chưa được gọi' }).uncheck();
    await expect(
      page.getByRole('switch', { name: 'Bật Nhắc khi lead chưa được gọi' }),
    ).not.toBeChecked();
    await expect(page.getByRole('status').filter({ hasText: 'Đã' })).toHaveCount(0, {
      timeout: 15_000,
    });
    await capture(page, 'Automations');
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
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Áp dụng vào trang đang sửa…' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Áp dụng mẫu vào trang đang sửa' }).getByText('Giữ nguyên'),
    ).toBeVisible();
    await capture(page, 'TemplateDetail-applyToPage');
  });

  test('19 WorkspaceTemplates', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/workspaces/${board.site.workspaceId}/templates?source=workspace`);
    await expect(page.getByRole('table').getByRole('row').nth(1)).toBeVisible();
    await capture(page, 'WorkspaceTemplates');
    await page
      .getByRole('button', { name: /^Phiên bản của/ })
      .first()
      .click();
    await expect(page.getByRole('dialog').getByRole('listitem').first()).toBeVisible();
    await capture(page, 'WorkspaceTemplates-versions');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Lưu trang thành template' }).click();
    await expect(
      page
        .getByRole('dialog', { name: 'Lưu trang thành template' })
        .getByRole('combobox', { name: 'Lấy từ' }),
    ).toBeEnabled();
    await capture(page, 'WorkspaceTemplates-saveDialog');
  });

  test('13 Domains and 14 DomainConnect', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.goto(sitePath('/domain'));
    await page.getByRole('link', { name: 'Kết nối tên miền riêng' }).first().click();
    await page
      .getByRole('textbox', { name: 'Tên miền' })
      .fill(`go.smilecare-${uniqueId()}.e2e.test`);
    await page.getByRole('button', { name: 'Tiếp tục' }).click();
    await expect(page.getByRole('row', { name: /^TXT/ })).toBeVisible();
    await capture(page, 'DomainConnect');

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(sitePath('/domain'));
    await expect(page.getByRole('heading', { level: 1, name: 'Tên miền' })).toBeVisible();
    await capture(page, 'Domains');
  });

  test('15 Members, 15b InviteAccept and 16 Roles', async ({ page, browser, request }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/workspaces/${board.site.workspaceId}/members`);
    const invited = `thu.ha-${uniqueId()}@example.com`;
    await page.getByRole('button', { name: 'Mời thành viên' }).click();
    const invite = page.getByRole('dialog', { name: 'Mời thành viên' });
    await invite.getByLabel('Email').fill(invited);
    await invite.getByRole('radio', { name: /Chăm sóc khách hàng/ }).check();
    await invite.getByRole('radio', { name: /Chỉ các site được chọn/ }).check();
    await invite.getByRole('checkbox', { name: board.site.name }).check();
    await invite.getByRole('button', { name: 'Gửi 1 lời mời' }).click();
    await expect(page.getByText('Đã gửi 1 lời mời', { exact: true })).toBeVisible();
    await capture(page, 'Members');

    const email = await waitForEmail(request, invited, 'mời bạn vào Mây Xanh Agency');
    const guest = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const phone = await guest.newPage();
    await phone.goto(accountLink(email, '/invite'));
    await expect(phone.getByLabel('Email')).toHaveValue(invited);
    await capture(phone, 'InviteAccept');
    await guest.close();

    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.goto(`/workspaces/${board.site.workspaceId}/roles`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await capture(page, 'Roles');
  });

  test('20 AiCreate and 21 AiAssistant', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.goto(sitePath('/pages/new/ai'));
    await fillAiBrief(page, `nieng-rang-ai-${uniqueId()}`);
    await capture(page, 'AiCreate');
    await page.getByRole('button', { name: 'Đề xuất cấu trúc trang' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Cấu trúc đề xuất' })).toBeVisible();
    await capture(page, 'AiCreate-structure');

    const editor = new Editor(page);
    await editor.goto(board.site.id, board.pages.home.id);
    await editor.heroRow.click();
    const panel = await openAiAssistant(page);
    await panel.getByRole('button', { name: 'Viết lại' }).click();
    await expect(panel.getByRole('region', { name: 'Gợi ý cho Hero' })).toBeVisible();
    await capture(page, 'AiAssistant');
  });

  // Last: it changes the promotion page's draft, which the screens above draw.
  test('37 MotionPage, 38 MotionSection and 39 StyleLibrary', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1560 });
    const editor = new Editor(page);
    await editor.goto(board.site.id, board.pages.promo.id);
    const settings = page.getByRole('complementary', { name: 'Cài đặt trang' });
    await settings
      .getByRole('group', { name: 'Phong cách chuyển động' })
      .getByRole('button', { name: /^Mượt mà/ })
      .click();
    await editor.expectSaved();
    await capture(page, 'MotionPage');

    await page.setViewportSize({ width: 1440, height: 1200 });
    // Board 38's state: only the motion group is open, which this button leaves, and folded groups
    // stay folded on the next section.
    await settings.getByRole('button', { name: 'Chỉnh riêng cho từng section' }).click();
    await editor.rows
      .filter({ hasText: 'Lợi ích' })
      .first()
      .getByRole('button', { name: /^Lợi ích/ })
      .click();
    const enter = page.getByRole('group', { name: 'Cách xuất hiện' });
    await enter.getByRole('button', { name: /^Bật lên/ }).click();
    await enter.scrollIntoViewIfNeeded();
    await capture(page, 'MotionSection');

    await editor.canvas.getByRole('button', { name: 'Chạy thử hiệu ứng' }).click();
    await expect(page.getByText('Đã chạy thử xong', { exact: false })).toBeVisible({
      timeout: 30_000,
    });
    await capture(page, 'MotionSection-played');
    await page.getByRole('button', { name: 'Quay lại chỉnh sửa' }).click();

    await page.setViewportSize({ width: 1440, height: 1360 });
    await editor.structure.getByRole('button', { name: 'Chuyển động · Mượt mà' }).click();
    await settings.getByRole('button', { name: 'So sánh' }).click();
    const library = page.getByRole('dialog', { name: 'Phong cách chuyển động' });
    await library.getByRole('button', { name: 'Chọn Sang trọng' }).click();
    await capture(page, 'StyleLibrary');
  });
});
