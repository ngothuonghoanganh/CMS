import { expect, test } from '@playwright/test';
import { Editor } from '../support/editor.js';
import { createPageViaApi, setUpLeadCaptureViaApi, setUpSite, uniqueId } from '../support/setup.js';
import { sendLead } from '../support/visitor.js';
import { siteOrigin } from '../urls.js';

test.describe('B5 · requests from people who sent a form', () => {
  test('the owner records a deletion request, handles it before its deadlines, and the data is gone', async ({
    page,
    browser,
  }) => {
    const { site } = await setUpSite(page.request);
    await setUpLeadCaptureViaApi(page.request, site.id);
    const slug = `tu-van-${uniqueId()}`;
    const created = await createPageViaApi(page.request, site.id, {
      title: 'Tư vấn niềng răng',
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

    // Two leads of the same person (same phone number), and one of someone else.
    const pageUrl = `${siteOrigin(site.subdomain)}/${slug}`;
    await sendLead(browser, pageUrl, { name: 'Lê Mai Anh', phone: '0987 106 223' });
    await sendLead(browser, pageUrl, { name: 'Mai Anh', phone: '0987106223' });
    await sendLead(browser, pageUrl, { name: 'Phạm Gia Huy', phone: '0912 448 019' });

    await page.goto(`/sites/${site.id}/privacy`);
    const requests = page.getByRole('region', { name: 'Yêu cầu từ người gửi form' });
    await expect(requests.getByText(/Chưa có yêu cầu nào/)).toBeVisible();

    // Record the request the person sent by phone; its deadlines show as it is filled in.
    await requests.getByRole('button', { name: 'Ghi nhận yêu cầu' }).click();
    const record = page.getByRole('dialog', { name: 'Ghi nhận yêu cầu' });
    await record.getByRole('textbox', { name: /Họ tên/ }).fill('Lê Mai Anh');
    await record.getByRole('textbox', { name: 'Số điện thoại' }).fill('0987 106 223');
    await record.getByRole('radio', { name: /Xóa toàn bộ dữ liệu/ }).check();
    await expect(
      record.getByText(/^Phản hồi trước \d{2}\/\d{2}\/\d{4} · Hoàn tất trước/),
    ).toBeVisible();
    await record.getByRole('button', { name: 'Ghi nhận' }).click();
    await expect(page.getByText('Đã ghi nhận yêu cầu', { exact: true })).toBeVisible();
    await expect(record).toBeHidden();

    const row = requests.getByRole('row').filter({ hasText: 'Lê Mai Anh' });
    await expect(row).toContainText('0987 106 223 · 2 lead');
    await expect(row).toContainText('Xóa toàn bộ dữ liệu');
    await expect(row).toContainText(/Phản hồi trước \d{2}\/\d{2}/);
    await expect(row.getByText('Cần phản hồi')).toBeVisible();

    // Answer the person, then delete their data after a confirmation.
    await row.getByRole('button', { name: 'Xử lý yêu cầu của Lê Mai Anh' }).click();
    const handle = page.getByRole('dialog', { name: 'Xóa toàn bộ dữ liệu' });
    const theirLeads = handle.getByRole('list', { name: 'Lead của người này' });
    await expect(theirLeads.getByRole('listitem')).toHaveCount(2);
    await handle.getByRole('button', { name: 'Đã phản hồi người yêu cầu' }).click();
    await expect(handle.getByRole('list', { name: 'Nhật ký' })).toContainText(
      'Đã phản hồi người yêu cầu',
    );
    await handle.getByRole('button', { name: 'Xóa dữ liệu và hoàn tất' }).click();
    await expect(handle.getByText(/Không hoàn tác được/)).toBeVisible();
    await handle.getByRole('button', { name: 'Xác nhận' }).click();
    await expect(handle.getByText(/Dữ liệu của người này đã được xóa/)).toBeVisible();
    await expect(handle.getByRole('list', { name: 'Nhật ký' })).toContainText(
      'Đã xóa 2 lead, hoàn tất',
    );
    await handle.getByRole('button', { name: 'Đóng' }).first().click();

    // Only a masked contact is left of the person.
    const done = requests.getByRole('row').filter({ hasText: 'L. M. A.' });
    await expect(done).toContainText('0987 *** 223 · đã xóa 2 lead');
    await expect(done.getByText(/^Hoàn tất \d{2}\/\d{2}$/)).toBeVisible();
    await expect(requests).not.toContainText('Lê Mai Anh');

    // The inbox keeps the other person's lead only; the owner corrects their phone number.
    await page.goto(`/sites/${site.id}/leads?range=all`);
    const list = page.getByRole('region', { name: 'Danh sách lead' });
    await expect(list.getByRole('row')).toHaveCount(2);
    await list.getByRole('link', { name: 'Phạm Gia Huy' }).click();
    const panel = page.getByRole('complementary', { name: 'Phạm Gia Huy' });
    await panel.getByRole('button', { name: 'Sửa thông tin' }).click();
    const edit = page.getByRole('dialog', { name: 'Sửa thông tin' });
    await edit.getByRole('textbox', { name: /Số điện thoại/ }).fill('0912 448 020');
    await edit.getByRole('button', { name: 'Lưu thông tin' }).click();
    await expect(page.getByText('Đã sửa thông tin của lead', { exact: true })).toBeVisible();
    await expect(panel.getByText('0912 448 020')).toBeVisible();
    await expect(list.getByRole('row').filter({ hasText: 'Phạm Gia Huy' })).toContainText(
      '0912 448 020',
    );
  });
});
