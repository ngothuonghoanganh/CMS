import { expect, test } from '@playwright/test';
import { Editor } from '../support/editor.js';
import { createPageViaApi, setUpLeadCaptureViaApi, setUpSite, uniqueId } from '../support/setup.js';
import { sendLead } from '../support/visitor.js';
import { siteOrigin } from '../urls.js';

test.describe('K2 · customer profile', () => {
  test('the owner notes, plans and books on a profile, exports the person, then deletes them', async ({
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
    const pageUrl = `${siteOrigin(site.subdomain)}/${slug}`;
    await sendLead(browser, pageUrl, { name: 'Nguyễn Thu Trang', phone: '0912 345 678' });

    // Phase 3, step 2: the profile opens from the list.
    await page.goto(`/sites/${site.id}/contacts`);
    await page
      .getByRole('region', { name: 'Danh sách khách hàng' })
      .getByRole('link', { name: 'Nguyễn Thu Trang' })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Nguyễn Thu Trang' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Gọi' })).toHaveAttribute(
      'href',
      'tel:+84912345678',
    );
    await expect(page.getByRole('region', { name: 'Đồng ý' })).toContainText(
      'Xử lý dữ liệu để tư vấn',
    );
    const timeline = page.getByRole('region', { name: 'Dòng thời gian' });
    await expect(timeline.getByText('Lead mới từ “Ưu đãi niềng răng”')).toBeVisible();

    // A note, a task and a meeting from the composer.
    await page.getByRole('textbox', { name: 'Ghi chú' }).fill('Quan tâm Invisalign, sợ đau.');
    await page.getByRole('button', { name: 'Lưu ghi chú' }).click();
    await expect(timeline.getByText('Quan tâm Invisalign, sợ đau.')).toBeVisible();

    const composer = page.getByRole('tablist', { name: 'Thêm vào hồ sơ' });
    await composer.getByRole('tab', { name: 'Công việc' }).click();
    await page.getByRole('textbox', { name: 'Việc cần làm' }).fill('Gửi bảng giá trả góp');
    await page.getByRole('button', { name: 'Thêm công việc' }).click();
    const tasks = page.getByRole('region', { name: 'Công việc' });
    const task = tasks.getByRole('checkbox', { name: /Gửi bảng giá trả góp/ });
    await expect(task).not.toBeChecked();

    await composer.getByRole('tab', { name: 'Lịch hẹn' }).click();
    const tomorrow = new Date(Date.now() + 7 * 3_600_000 + 24 * 3_600_000)
      .toISOString()
      .slice(0, 10);
    await page.getByLabel('Ngày giờ').fill(`${tomorrow}T09:30`);
    await page.getByRole('textbox', { name: 'Nơi' }).fill('Chi nhánh Quận 3');
    await page.getByRole('textbox', { name: /Người gặp/ }).fill('BS. Trần Minh');
    await page.getByRole('button', { name: 'Đặt lịch hẹn' }).click();
    await expect(page.getByRole('region', { name: 'Lịch hẹn sắp tới' })).toContainText(
      'Chi nhánh Quận 3 · BS. Trần Minh',
    );
    await expect(timeline.getByText(/^Đặt lịch hẹn /)).toBeVisible();

    await task.check();
    await expect(task).toBeChecked();

    // Owner and tag on the "Thông tin" card.
    await page.getByRole('button', { name: '+ Nhãn' }).click();
    await page.getByRole('combobox', { name: 'Nhãn mới' }).fill('Trả góp');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('region', { name: 'Thông tin' })).toContainText('Trả góp');

    // The person's data.
    await page.getByRole('button', { name: 'Thao tác dữ liệu' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Xuất dữ liệu của người này' }).click();
    expect((await download).suggestedFilename()).toMatch(/^du-lieu-ca-nhan-.*\.json$/);
    await expect(page.getByText('Đã xuất dữ liệu của người này', { exact: true })).toBeVisible();
    await expect(page.getByRole('menu')).toBeHidden();

    await page.getByRole('button', { name: 'Thao tác dữ liệu' }).click();
    await page.getByRole('menuitem', { name: 'Xóa dữ liệu của người này' }).click();
    const confirm = page.getByRole('alertdialog', {
      name: 'Xóa toàn bộ dữ liệu của Nguyễn Thu Trang?',
    });
    await expect(confirm).toContainText(
      '1 lead và bằng chứng đồng ý, 1 ghi chú, 1 công việc, 1 lịch hẹn.',
    );
    await confirm.getByRole('button', { name: 'Xóa dữ liệu' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Khách hàng' })).toBeVisible();
    await expect(
      page.getByText('Đã xóa dữ liệu của Nguyễn Thu Trang', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Danh sách khách hàng' }).getByText('Nguyễn Thu Trang'),
    ).toHaveCount(0);
  });
});
