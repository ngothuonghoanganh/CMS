import { expect, test } from '@playwright/test';
import { Editor } from '../support/editor.js';
import { createPageViaApi, setUpLeadCaptureViaApi, setUpSite, uniqueId } from '../support/setup.js';
import { sendLead } from '../support/visitor.js';
import { siteOrigin } from '../urls.js';

test.describe('K1 · customers', () => {
  test('a form gathers one person into one profile; the owner adds, assigns, tags and merges', async ({
    page,
    browser,
  }) => {
    const { site } = await setUpSite(page.request);
    await setUpLeadCaptureViaApi(page.request, site.id);
    const slug = `uu-dai-${uniqueId()}`;
    const created = await createPageViaApi(page.request, site.id, {
      title: 'Ưu đãi niềng răng',
      slug,
      start: {
        kind: 'goal',
        goal: 'lead',
        brief: { offer: 'Niềng răng trong suốt', audience: '', phone: '0901 234 567' },
        style: 'calm',
      },
    });
    const editor = new Editor(page);
    await editor.goto(site.id, created.page.id);
    await editor.publish(1, 'Có form đăng ký');

    // Phase 3, step 1: a visitor's lead creates the profile, a second one with the same number
    // joins it.
    const pageUrl = `${siteOrigin(site.subdomain)}/${slug}`;
    await sendLead(browser, pageUrl, { name: 'Nguyễn Thu Trang', phone: '0912 345 678' });
    await sendLead(browser, pageUrl, { name: 'Thu Trang', phone: '+84 912 345 678' });
    await sendLead(browser, pageUrl, { name: 'Lê Thị Mai', phone: '0901 111 001' });
    await sendLead(browser, pageUrl, { name: 'Le Thi Mai', phone: '0901 111 002' });

    await page.goto(`/sites/${site.id}`);
    await page
      .getByRole('navigation', { name: 'Điều hướng chính' })
      .getByRole('link', { name: 'Khách hàng' })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Khách hàng' })).toBeVisible();
    const views = page.getByRole('group', { name: 'Danh sách' });
    await expect(views.getByRole('button', { name: 'Tất cả · 3' })).toBeVisible();
    await expect(views.getByRole('button', { name: 'Có thể trùng · 1' })).toBeVisible();
    const list = page.getByRole('region', { name: 'Danh sách khách hàng' });
    const trang = list.getByRole('row').filter({ hasText: 'Nguyễn Thu Trang' });
    await expect(trang).toContainText('0912 345 678');
    await expect(trang).toContainText('Ưu đãi niềng răng');
    await expect(trang).toContainText('2 lead');
    await expect(trang).toContainText('Chưa giao');

    // Assign and tag from the bulk bar.
    await trang.getByRole('checkbox', { name: 'Chọn Nguyễn Thu Trang' }).check();
    const bar = page.getByRole('toolbar', { name: 'Thao tác hàng loạt' });
    await expect(bar).toContainText('1 khách đã chọn');
    await bar.getByRole('button', { name: 'Gắn nhãn…' }).click();
    const tagDialog = page.getByRole('dialog', { name: 'Gắn nhãn' });
    await tagDialog.getByRole('combobox', { name: 'Nhãn' }).fill('Niềng răng');
    await tagDialog.getByRole('button', { name: 'Gắn nhãn' }).click();
    await expect(trang).toContainText('Niềng răng');
    await trang.getByRole('checkbox', { name: 'Chọn Nguyễn Thu Trang' }).check();
    await bar.getByRole('button', { name: 'Giao cho…' }).click();
    await page.getByRole('menuitem').first().click();
    await expect(views.getByRole('button', { name: 'Của tôi · 1' })).toBeVisible();
    await expect(trang).not.toContainText('Chưa giao');

    // Search stays in the request body.
    await page.getByRole('searchbox', { name: 'Tìm khách hàng' }).fill('0912');
    await expect(list.getByRole('row')).toHaveCount(2);
    expect(page.url()).not.toContain('0912');
    await page.getByRole('searchbox', { name: 'Tìm khách hàng' }).fill('');

    // Someone who called: the number of an existing profile points to it.
    await page.getByRole('button', { name: 'Thêm khách hàng' }).click();
    const add = page.getByRole('dialog', { name: 'Thêm khách hàng' });
    await add.getByRole('textbox', { name: /Họ và tên/ }).fill('Trang');
    await add.getByRole('textbox', { name: /Số điện thoại/ }).fill('0912 345 678');
    await add.getByRole('button', { name: 'Thêm khách hàng' }).click();
    await expect(add.getByRole('status')).toContainText('Số này đã thuộc hồ sơ Nguyễn Thu Trang.');
    await add.getByRole('textbox', { name: /Số điện thoại/ }).fill('0915 007 266');
    await add.getByRole('textbox', { name: /Họ và tên/ }).fill('Bùi Thanh Hương');
    await add
      .getByRole('combobox', { name: /Bạn có thông tin này từ đâu/ })
      .selectOption('walk_in');
    await add.getByRole('button', { name: 'Thêm khách hàng' }).click();
    await expect(add).toBeHidden();
    await expect(list.getByRole('row').filter({ hasText: 'Bùi Thanh Hương' })).toContainText(
      'Thêm tay · khách đến trực tiếp',
    );

    // The two Mai profiles: one name, one page, the same day.
    await views.getByRole('button', { name: 'Có thể trùng · 1' }).click();
    const pair = page.getByRole('region', { name: 'Cặp 1/1 · có thể là cùng một người' });
    await expect(pair).toContainText('cùng đăng ký trang Ưu đãi niềng răng trong cùng ngày');
    await pair.getByRole('button', { name: 'Gộp hai hồ sơ' }).click();
    await expect(page.getByText('Đã gộp vào hồ sơ Lê Thị Mai', { exact: true })).toBeVisible();
    await expect(views.getByRole('button', { name: 'Có thể trùng · 0' })).toBeVisible();
    await views.getByRole('button', { name: 'Tất cả · 3' }).click();
    await expect(list.getByRole('row').filter({ hasText: 'Lê Thị Mai' })).toContainText('2 lead');
  });
});
