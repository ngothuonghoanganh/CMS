import { expect, test } from '@playwright/test';
import { Editor } from '../support/editor.js';
import { confirmationLink, waitForEmail } from '../support/mailpit.js';
import {
  configurePrivacyViaApi,
  createPageViaApi,
  newRecipientEmail,
  setUpSite,
  uniqueId,
} from '../support/setup.js';
import { sendLead } from '../support/visitor.js';
import { siteOrigin } from '../urls.js';

test.describe('B4 · lead recipients and email notifications', () => {
  test('a form needs a confirmed address, then every lead is emailed with a link to it', async ({
    page,
    browser,
  }) => {
    const { site } = await setUpSite(page.request);
    await configurePrivacyViaApi(page.request, site.id);
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

    // Without a confirmed address the form blocks publishing; "Sửa ngay" opens "Nơi nhận lead".
    const publish = await editor.openPublishDialog();
    const destination = publish
      .getByRole('listitem')
      .filter({ hasText: 'Form đăng ký chưa có nơi nhận lead' });
    await expect(destination).toBeVisible();
    await expect(publish.getByRole('button', { name: 'Xuất bản v1' })).toBeDisabled();
    await destination.getByRole('button', { name: 'Sửa ngay' }).click();
    await expect(page).toHaveURL(new RegExp(`/sites/${site.id}/leads`));
    const recipients = page.getByRole('dialog', { name: 'Nơi nhận lead' });
    await expect(recipients).toBeVisible();

    const email = newRecipientEmail();
    await recipients.getByRole('textbox', { name: 'Thêm email nhận lead' }).fill(email);
    await recipients.getByRole('button', { name: 'Thêm' }).click();
    // `exact`: the toast's text is repeated, with more words, in its live region.
    await expect(page.getByText(`Đã gửi thư xác nhận tới ${email}`, { exact: true })).toBeVisible();
    await expect(recipients.getByRole('listitem').filter({ hasText: email })).toContainText(
      'Chờ xác nhận',
    );

    // The address confirms from its email, in a browser without the owner's session.
    const invitation = await waitForEmail(page.request, email, 'Xác nhận nhận lead');
    const outsider = await browser.newContext();
    const confirmPage = await outsider.newPage();
    await confirmPage.goto(confirmationLink(invitation));
    await confirmPage.getByRole('button', { name: 'Xác nhận nhận lead' }).click();
    await expect(confirmPage.getByRole('status')).toContainText(
      `${email} sẽ nhận email khi có lead mới từ ${site.name}.`,
    );
    expect(new URL(confirmPage.url()).hash).toBe('');
    await outsider.close();

    await editor.goto(site.id, created.page.id);
    await editor.publish(1, 'Có nơi nhận lead');

    await sendLead(browser, `${siteOrigin(site.subdomain)}/${slug}`, {
      name: 'Nguyễn Thu Hà',
      phone: '0901 234 567',
    });
    const notification = await waitForEmail(page.request, email, 'Lead mới: Nguyễn Thu Hà');
    expect(notification.Subject).toBe(`[${site.name}] Lead mới: Nguyễn Thu Hà`);
    expect(notification.Text).toContain('Số điện thoại: 0901 234 567');
    expect(notification.Text).toContain('Trang: Tư vấn niềng răng (v1)');

    // The link in the email opens the lead in the inbox, with where it was sent.
    const link = /http:\/\/localhost:3100\/sites\/\S+/.exec(notification.Text)?.[0];
    expect(link).toBeDefined();
    await page.goto(link ?? '');
    const detail = page.getByRole('complementary', { name: 'Nguyễn Thu Hà' });
    await expect(detail.getByRole('region', { name: 'Đã gửi tới' })).toContainText(
      'Email thông báo · 1 người nhận',
    );
  });
});
