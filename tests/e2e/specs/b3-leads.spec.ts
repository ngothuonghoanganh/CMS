import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { personExportFileSchema, vnDayOf } from '@plp/contracts';
import { Editor } from '../support/editor.js';
import { createPageViaApi, setUpLeadCaptureViaApi, setUpSite, uniqueId } from '../support/setup.js';
import { FILLED_CONSENT, sendLead } from '../support/visitor.js';
import { siteOrigin } from '../urls.js';

async function download(page: Page, action: () => Promise<void>) {
  const [file] = await Promise.all([page.waitForEvent('download'), action()]);
  const path = await file.path();
  return { name: file.suggestedFilename(), text: await readFile(path, 'utf8') };
}

test.describe('B3 · lead inbox', () => {
  test('the owner triages, searches, exports and deletes leads, and the counts follow', async ({
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

    const pageUrl = `${siteOrigin(site.subdomain)}/${slug}`;
    await sendLead(browser, pageUrl, { name: 'Nguyễn Thu Hà', phone: '0901 234 567' });
    await sendLead(browser, pageUrl, { name: '=1+1', phone: '0938 512 840' });
    await sendLead(browser, pageUrl, { name: 'Bot quảng cáo', phone: '0911 111 111', bot: true });

    // The dashboard, the page list and the sidebar badge count the same two leads; spam is out.
    await page.goto(`/sites/${site.id}`);
    const summary = page.getByRole('region', { name: 'Tóm tắt site' });
    await expect(summary.getByText('Lead 7 ngày qua')).toBeVisible();
    await expect(summary.getByText('2', { exact: true })).toBeVisible();
    await expect(summary.getByRole('link', { name: '2 chưa xử lý' })).toBeVisible();
    const pageRow = page.getByRole('row').filter({ hasText: 'Tư vấn niềng răng' });
    await expect(pageRow.getByRole('cell').nth(4)).toHaveText('2');
    const nav = page.getByRole('navigation', { name: 'Điều hướng chính' });
    await nav.getByRole('link', { name: 'Leads 2 mới' }).click();

    await expect(page).toHaveURL(new RegExp(`/sites/${site.id}/leads\\?status=new&range=all$`));
    const folders = page.getByRole('group', { name: 'Thư mục' });
    await expect(folders.getByRole('button', { name: 'Hộp thư · 2' })).toBeVisible();
    await expect(folders.getByRole('button', { name: 'Nghi ngờ spam · 1' })).toBeVisible();
    const list = page.getByRole('region', { name: 'Danh sách lead' });
    await expect(list.getByRole('row')).toHaveCount(3);

    // Triage the first lead: status and note; the badge follows.
    await list.getByRole('link', { name: 'Nguyễn Thu Hà' }).click();
    const detail = page.getByRole('complementary', { name: 'Nguyễn Thu Hà' });
    await expect(detail.getByRole('heading', { name: 'Nguyễn Thu Hà' })).toBeFocused();
    await expect(detail.getByRole('link', { name: 'Gọi' })).toHaveAttribute(
      'href',
      'tel:+84901234567',
    );
    await expect(detail.getByText(/Nội dung đồng ý bản 1 · lúc \d{2}:\d{2}:\d{2}/)).toBeVisible();
    await detail.getByRole('button', { name: 'Xem nội dung' }).click();
    const evidence = page.getByRole('dialog', { name: 'Nội dung đồng ý bản 1' });
    await expect(evidence.getByText(FILLED_CONSENT)).toBeVisible();
    await evidence.getByRole('button', { name: 'Đóng' }).click();

    await detail.getByRole('combobox', { name: 'Trạng thái lead' }).selectOption('contacted');
    await expect(nav.getByRole('link', { name: 'Leads 1 mới' })).toBeVisible();
    await detail.getByRole('textbox', { name: /Ghi chú nội bộ/ }).fill('Hẹn gọi lại sau 18h');
    await detail.getByRole('button', { name: 'Lưu ghi chú' }).click();
    await expect(page.getByText('Đã lưu ghi chú', { exact: true })).toBeVisible();
    await page.reload();
    await expect(
      page
        .getByRole('complementary', { name: 'Nguyễn Thu Hà' })
        .getByRole('textbox', { name: /Ghi chú nội bộ/ }),
    ).toHaveValue('Hẹn gọi lại sau 18h');

    // Search every new and contacted lead by the start of a phone number.
    await page.goto(`/sites/${site.id}/leads`);
    await page.getByRole('searchbox', { name: 'Tìm lead' }).fill('0938');
    await expect(list.getByRole('row')).toHaveCount(2);
    await expect(list.getByRole('link', { name: '=1+1' })).toBeVisible();
    await page.getByRole('searchbox', { name: 'Tìm lead' }).fill('');
    await expect(list.getByRole('row')).toHaveCount(3);

    // The CSV opens in Excel as Vietnamese text, with the formula kept as text.
    const csv = await download(page, () =>
      page.getByRole('button', { name: 'Xuất Excel / CSV' }).click(),
    );
    expect(csv.name).toBe(`leads-${site.subdomain}-${vnDayOf(new Date())}.csv`);
    expect(csv.text.startsWith('﻿Thời gian,Họ và tên,Số điện thoại')).toBe(true);
    expect(csv.text).toContain(`,'=1+1,0938 512 840,`);
    expect(csv.text).toContain(',Nguyễn Thu Hà,0901 234 567,');
    expect(csv.text).toContain('Hẹn gọi lại sau 18h');
    expect(csv.text).not.toContain('Bot quảng cáo');

    await folders.getByRole('button', { name: 'Nghi ngờ spam · 1' }).click();
    await expect(list.getByRole('link', { name: 'Bot quảng cáo' })).toBeVisible();
    await folders.getByRole('button', { name: 'Hộp thư · 2' }).click();

    // Export, then delete, everything of one person.
    await list.getByRole('link', { name: 'Nguyễn Thu Hà' }).click();
    const person = page.getByRole('complementary', { name: 'Nguyễn Thu Hà' });
    await person.getByRole('button', { name: 'Xuất dữ liệu người này' }).click();
    const json = await download(page, () =>
      page.getByRole('menuitem', { name: 'File JSON' }).click(),
    );
    const exported = personExportFileSchema.parse(JSON.parse(json.text));
    expect(exported.leads.map((lead) => lead.name)).toEqual(['Nguyễn Thu Hà']);
    expect(exported.leads[0]?.consent.requiredText).toBe(FILLED_CONSENT);

    await person.getByRole('button', { name: 'Xóa dữ liệu người này' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Xóa dữ liệu của Nguyễn Thu Hà?' });
    await expect(confirm).toContainText('Xóa 1 lead');
    await confirm.getByRole('button', { name: 'Xóa dữ liệu' }).click();
    await expect(page.getByText('Đã xóa 1 lead của người này', { exact: true })).toBeVisible();
    await expect(list.getByRole('link', { name: 'Nguyễn Thu Hà' })).toHaveCount(0);
    await expect(folders.getByRole('button', { name: 'Hộp thư · 1' })).toBeVisible();
  });
});
