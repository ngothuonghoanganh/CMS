import { type Cookie, expect, type Page, test } from '@playwright/test';
import { expectAccessible, SCAN_VIEWPORTS } from '../support/axe.js';
import { type Board, seedBoard } from '../support/board.js';
import { Editor } from '../support/editor.js';
import { confirmationLink, waitForEmail } from '../support/mailpit.js';
import { call, createPageViaApi, newRecipientEmail, uniqueId } from '../support/setup.js';
import { endpoints, leadRecipientSchema } from '@plp/contracts';

/*
 * WCAG 2.2 AA scans (axe-core) of every admin screen, at the boards' width and on a phone, with
 * the board's data: pages in every state, leads, views and data requests. What axe cannot judge
 * (focus hidden under sticky bars, reflow at 320 px, target sizes) is checked in
 * a11y-manual.spec.ts.
 */

let board: Board;
let session: Cookie[];

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  board = await seedBoard(context.request);
  session = (await context.storageState()).cookies;
  await context.close();
});

function heading(page: Page, name: string) {
  return page.getByRole('heading', { level: 1, name, exact: true });
}

for (const viewport of SCAN_VIEWPORTS) {
  test.describe(`Accessibility · admin at ${viewport.width} px`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('login and sign-up', async ({ page }) => {
      await page.goto('/login');
      await expect(page.getByRole('button', { name: 'Đăng nhập' })).toBeVisible();
      await expectAccessible(page, 'Đăng nhập');
      // A refused login shows its error next to the form.
      await page.getByLabel('Email').fill(`khong-co-${uniqueId()}@example.com`);
      await page.getByLabel('Mật khẩu').fill('sai-mat-khau-123');
      await page.getByRole('button', { name: 'Đăng nhập' }).click();
      await expect(page.getByRole('alert')).toBeVisible();
      await expectAccessible(page, 'Đăng nhập · lỗi');

      await page.goto('/signup');
      await expect(page.getByRole('button', { name: 'Tạo tài khoản' })).toBeVisible();
      await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
      await expectAccessible(page, 'Đăng ký · lỗi từng ô');
    });

    test.describe('signed in as the owner', () => {
      test.beforeEach(async ({ context }) => {
        await context.addCookies(session);
      });

      test('new site', async ({ page }) => {
        await page.goto('/sites/new');
        await expect(page.getByLabel('Tên miền con')).toBeVisible();
        await page.getByLabel('Tên miền con').fill(board.site.subdomain);
        await expect(page.getByText('Tên miền con này đã có người dùng')).toBeVisible();
        await expectAccessible(page, 'Tạo site');
      });

      test('dashboard with pages in every state', async ({ page }) => {
        await page.goto(`/sites/${board.site.id}`);
        await expect(heading(page, 'Trang')).toBeVisible();
        await expect(
          page.getByRole('row').filter({ hasText: 'Tri ân khách hàng 2025' }),
        ).toBeVisible();
        await expectAccessible(page, 'Bảng điều khiển');
        if (viewport.name === 'phone') {
          await page.getByRole('button', { name: 'Mở menu điều hướng' }).click();
          await expect(page.getByRole('navigation', { name: 'Điều hướng chính' })).toBeVisible();
          await expectAccessible(page, 'Bảng điều khiển · menu điều hướng');
        } else {
          await page
            .getByRole('button', { name: `Tùy chọn khác cho ${board.pages.promo.title}` })
            .click();
          await expect(page.getByRole('menu')).toBeVisible();
          await expectAccessible(page, 'Bảng điều khiển · menu của trang');
        }
      });

      test('the page wizard, step by step', async ({ page }) => {
        await page.goto(`/sites/${board.site.id}/pages/new`);
        await expect(heading(page, 'Trang này dùng để làm gì?')).toBeVisible();
        await page.getByRole('radio', { name: 'Ưu đãi có thời hạn' }).check();
        await expectAccessible(page, 'Tạo trang · bước 1');
        await page.getByRole('button', { name: 'Tiếp tục' }).click();
        await expect(heading(page, 'Nội dung chính')).toBeVisible();
        // An empty title and an invalid path show their errors.
        await page.getByLabel('Tên trang').fill('');
        await page.getByLabel('Đường dẫn').fill('Đường dẫn có dấu');
        await page.getByRole('button', { name: 'Tiếp tục' }).click();
        await expect(heading(page, 'Nội dung chính')).toBeVisible();
        await expectAccessible(page, 'Tạo trang · bước 2 · lỗi');
        await page.getByLabel('Tên trang').fill('Ưu đãi tẩy trắng răng');
        await page.getByLabel('Đường dẫn').fill(`tay-trang-${uniqueId()}`);
        await expect(page.getByText('Đường dẫn này dùng được.')).toBeVisible();
        await page.getByRole('button', { name: 'Tiếp tục' }).click();
        await expect(page.getByRole('radio', { name: 'Nhẹ nhàng' })).toBeVisible();
        await expectAccessible(page, 'Tạo trang · bước 3');
        await page.getByRole('button', { name: 'Bắt đầu trống' }).click();
        await expect(page.getByRole('dialog', { name: 'Bắt đầu trống' })).toBeVisible();
        await expectAccessible(page, 'Tạo trang · Bắt đầu trống');
      });

      test('editor with a section selected, and "Thêm section"', async ({ page }) => {
        const editor = new Editor(page);
        await editor.goto(board.site.id, board.pages.promo.id);
        await editor.heroRow.click();
        await expect(editor.heroPanel).toBeVisible();
        await expectAccessible(page, 'Editor · Hero');

        await editor.structure.getByRole('button', { name: 'Thêm section', exact: true }).click();
        const add = page.getByRole('dialog', { name: 'Thêm section' });
        await expect(add).toBeVisible();
        await expectAccessible(page, 'Thêm section');
        await add.getByRole('button', { name: /^Form & liên hệ/ }).click();
        await expectAccessible(page, 'Thêm section · Form & liên hệ');
      });

      test('publish dialog: checks, then the success state', async ({ page }) => {
        const created = await createPageViaApi(page.request, board.site.id, {
          title: 'Webinar niềng răng cho phụ huynh',
          slug: `webinar-${uniqueId()}`,
          start: {
            kind: 'goal',
            goal: 'event',
            brief: { offer: 'Webinar niềng răng', audience: '', phone: '0901 234 567' },
            style: 'calm',
          },
        });
        const editor = new Editor(page);
        await editor.goto(board.site.id, created.page.id);
        const dialog = await editor.openPublishDialog();
        await expect(dialog.getByRole('button', { name: 'Bỏ qua lần này' }).first()).toBeVisible();
        await expectAccessible(page, 'Xuất bản · kiểm tra');
        const done = await editor.publishFromDialog(dialog, 1, 'Bản đầu tiên');
        await expect(done).toBeVisible();
        await expectAccessible(page, 'Xuất bản · đã live');
      });

      test('history with the rollback panel', async ({ page }) => {
        await page.goto(`/sites/${board.site.id}/pages/${board.pages.implant.id}/history`);
        await expect(page.getByRole('heading', { name: 'Phiên bản đã xuất bản' })).toBeVisible();
        await expectAccessible(page, 'Lịch sử phiên bản');
        const v2 = page
          .getByRole('listitem')
          .filter({ has: page.getByRole('heading', { name: 'v2', exact: true }) });
        await v2.getByRole('button', { name: 'Khôi phục bản này' }).click();
        const panel = page.getByRole('region', { name: 'Khôi phục v2 thành bản live?' });
        await expect(panel).toBeVisible();
        await expectAccessible(page, 'Lịch sử · khôi phục');
      });

      test('SEO, domain and site settings', async ({ page }) => {
        await page.goto(`/sites/${board.site.id}/pages/${board.pages.promo.id}/seo`);
        await expect(page.getByRole('textbox', { name: /Tiêu đề/ }).first()).toBeVisible();
        await expectAccessible(page, 'SEO & chia sẻ');

        await page.goto(`/sites/${board.site.id}/domain`);
        await expect(heading(page, 'Tên miền')).toBeVisible();
        await expectAccessible(page, 'Tên miền');

        await page.goto(`/sites/${board.site.id}/settings`);
        await expect(heading(page, 'Cài đặt site')).toBeVisible();
        await expectAccessible(page, 'Cài đặt site');
      });

      test('lead inbox with a lead open, and "Nơi nhận lead"', async ({ page }) => {
        const leadId = board.leads.get('Nguyễn Thu Hà');
        await page.goto(`/sites/${board.site.id}/leads?range=all&lead=${leadId ?? ''}`);
        const detail = page.getByRole('complementary', { name: 'Nguyễn Thu Hà' });
        await expect(detail.getByText(/Nội dung đồng ý bản 2/)).toBeVisible();
        await expectAccessible(page, 'Leads · chi tiết lead');
        await detail.getByRole('button', { name: 'Xem nội dung' }).click();
        await expect(page.getByRole('dialog', { name: 'Nội dung đồng ý bản 2' })).toBeVisible();
        await expectAccessible(page, 'Leads · nội dung đồng ý');
        await page.keyboard.press('Escape');

        await page.goto(`/sites/${board.site.id}/leads?range=all&folder=spam`);
        await expect(page.getByRole('link', { name: 'Bot quảng cáo' })).toBeVisible();
        await expectAccessible(page, 'Leads · nghi ngờ spam');

        await page.goto(`/sites/${board.site.id}/leads?recipients=open`);
        const recipients = page.getByRole('dialog', { name: 'Nơi nhận lead' });
        await expect(recipients.getByRole('listitem').first()).toBeVisible();
        await expectAccessible(page, 'Leads · nơi nhận lead');
      });

      test('privacy and consent with data requests', async ({ page }) => {
        await page.goto(`/sites/${board.site.id}/privacy`);
        const requests = page.getByRole('region', { name: 'Yêu cầu từ người gửi form' });
        await expect(requests.getByRole('row').filter({ hasText: 'Lê Mai Anh' })).toBeVisible();
        await expectAccessible(page, 'Dữ liệu & đồng ý');
        await requests.getByRole('button', { name: 'Xử lý yêu cầu của Lê Mai Anh' }).click();
        const handle = page.getByRole('dialog', { name: 'Xóa toàn bộ dữ liệu' });
        await expect(handle.getByRole('list', { name: 'Lead của người này' })).toBeVisible();
        await expectAccessible(page, 'Dữ liệu & đồng ý · xử lý yêu cầu');
        await handle.getByRole('button', { name: 'Đóng' }).first().click();
        await requests.getByRole('button', { name: 'Ghi nhận yêu cầu' }).click();
        const record = page.getByRole('dialog', { name: 'Ghi nhận yêu cầu' });
        await record.getByRole('button', { name: 'Ghi nhận' }).click();
        await expectAccessible(page, 'Dữ liệu & đồng ý · ghi nhận yêu cầu · lỗi');
      });

      test('analytics with data', async ({ page }) => {
        await page.goto(`/sites/${board.site.id}/analytics`);
        await expect(heading(page, 'Hiệu quả')).toBeVisible();
        await expect(page.getByRole('term').filter({ hasText: 'Lượt xem' })).toBeVisible();
        await expectAccessible(page, 'Hiệu quả');
        await page.getByRole('button', { name: 'Xem dạng bảng' }).click();
        await expectAccessible(page, 'Hiệu quả · dạng bảng');
      });

      test('the confirmation page of a lead recipient', async ({ page, browser }) => {
        const email = newRecipientEmail();
        await call(
          page.request,
          'POST',
          endpoints.addLeadRecipient.path(board.site.id),
          leadRecipientSchema,
          { email },
        );
        const link = confirmationLink(
          await waitForEmail(page.request, email, 'Xác nhận nhận lead'),
        );
        const outsider = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
        });
        const confirmPage = await outsider.newPage();
        await confirmPage.goto(link);
        const confirm = confirmPage.getByRole('button', { name: 'Xác nhận nhận lead' });
        await expect(confirm).toBeVisible();
        await expectAccessible(confirmPage, 'Xác nhận nơi nhận lead');
        await confirm.click();
        await expect(confirmPage.getByRole('status')).toContainText(email);
        await expectAccessible(confirmPage, 'Xác nhận nơi nhận lead · đã xác nhận');
        await outsider.close();
      });
    });
  });
}
