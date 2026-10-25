import { expect, type Page, test } from '@playwright/test';
import { Editor } from '../support/editor.js';
import { confirmationLink, waitForEmail } from '../support/mailpit.js';
import { newRecipientEmail, PRIVACY, setUpSite, uniqueId } from '../support/setup.js';
import { FILLED_CONSENT, VISITOR_UA } from '../support/visitor.js';
import { siteOrigin } from '../urls.js';

/** The value of one tile of "Hiệu quả". */
function kpi(page: Page, label: string) {
  return page
    .getByRole('term')
    .filter({ hasText: label })
    .locator('xpath=following-sibling::dd[1]');
}

function navigate(page: Page, name: string | RegExp) {
  return page
    .getByRole('navigation', { name: 'Điều hướng chính' })
    .getByRole('link', { name })
    .click();
}

/** ARCHITECTURE §5: MVP B is done when this whole chain passes in one go, through the UI and Mailpit. */
test('MVP B: consent → confirmed recipient → "Thu lead" page → lead → email → inbox → "Hiệu quả" → deletion', async ({
  page,
  browser,
}) => {
  const { site } = await setUpSite(page.request);
  const slug = `tu-van-${uniqueId()}`;

  // 1. Who collects the data, the policy link, the consent text and one lead email, confirmed in
  //    Mailpit.
  await page.goto(`/sites/${site.id}`);
  await navigate(page, 'Dữ liệu & đồng ý');
  const settings = page.getByRole('form', { name: 'Cài đặt dữ liệu cá nhân' });
  await settings.getByRole('textbox', { name: /Tên doanh nghiệp/ }).fill(PRIVACY.controllerName);
  await settings.getByRole('textbox', { name: /Link chính sách/ }).fill(PRIVACY.policyUrl);
  await settings.getByRole('button', { name: 'Lưu cài đặt' }).click();
  await expect(page.getByText('Đã lưu cài đặt dữ liệu cá nhân', { exact: true })).toBeVisible();
  const consent = page.getByRole('region', { name: 'Nội dung đồng ý trên form' });
  await consent.getByRole('button', { name: 'Lưu thành bản 1' }).click();
  await expect(consent.getByText(/^Bản 1 · đang dùng từ/)).toBeVisible();

  await navigate(page, /^Leads/);
  await page.getByRole('button', { name: 'Nơi nhận lead' }).click();
  const recipients = page.getByRole('dialog', { name: 'Nơi nhận lead' });
  const email = newRecipientEmail();
  await recipients.getByRole('textbox', { name: 'Thêm email nhận lead' }).fill(email);
  await recipients.getByRole('button', { name: 'Thêm' }).click();
  await expect(recipients.getByRole('listitem').filter({ hasText: email })).toContainText(
    'Chờ xác nhận',
  );
  const invitation = await waitForEmail(page.request, email, 'Xác nhận nhận lead');
  const outsider = await browser.newContext();
  const confirmPage = await outsider.newPage();
  await confirmPage.goto(confirmationLink(invitation));
  await confirmPage.getByRole('button', { name: 'Xác nhận nhận lead' }).click();
  await expect(confirmPage.getByRole('status')).toContainText(`${email} sẽ nhận email`);
  await outsider.close();
  await page.keyboard.press('Escape');

  // 2. A page by the goal "Thu lead tư vấn", published.
  await navigate(page, 'Trang');
  await page.getByRole('link', { name: 'Tạo trang đầu tiên' }).click();
  await expect(page.getByRole('radio', { name: 'Thu lead tư vấn' })).toBeChecked();
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await page.getByLabel('Tên trang').fill('Tư vấn niềng răng');
  await page.getByLabel('Đường dẫn').fill(slug);
  await expect(page.getByText('Đường dẫn này dùng được.')).toBeVisible();
  // The navigation bar's button calls this number.
  await page
    .getByLabel('Số điện thoại nhận khách (gọi điện hoặc Zalo) · tùy chọn')
    .fill('0901 234 567');
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await page.getByRole('radio', { name: 'Nhẹ nhàng' }).check();
  await page.getByRole('button', { name: 'Tạo trang' }).click();
  const editor = new Editor(page);
  await expect(editor.canvas.getByText(FILLED_CONSENT)).toBeVisible();
  await editor.publish(1, 'Trang thu lead');

  // 3. A visitor opens the live page and sends the form, the consent ticked by them.
  const visitorContext = await browser.newContext({ userAgent: VISITOR_UA });
  const visitor = await visitorContext.newPage();
  const viewed = visitor.waitForResponse(
    (response) => response.url().endsWith('/_e') && response.request().method() === 'POST',
  );
  await visitor.goto(`${siteOrigin(site.subdomain)}/${slug}`);
  await viewed;
  const form = visitor.getByRole('form', { name: 'Đăng ký tư vấn miễn phí' });
  await form.getByRole('textbox', { name: 'Họ và tên' }).fill('Nguyễn Thu Hà');
  await form.getByRole('textbox', { name: 'Số điện thoại' }).fill('0901 234 567');
  const tick = form.getByRole('checkbox', { name: FILLED_CONSENT });
  await expect(tick).not.toBeChecked();
  await tick.check();
  // A person takes more than 3 seconds to fill the form; faster is taken for a bot (ADR-016).
  await visitor.waitForTimeout(3100);
  await form.getByRole('button', { name: 'Gửi đăng ký' }).click();
  await expect(
    visitor.getByRole('status').filter({ hasText: 'Đã nhận đăng ký của bạn' }),
  ).toBeVisible();
  await visitorContext.close();

  // 4. The notification email reaches Mailpit.
  const notification = await waitForEmail(page.request, email, 'Lead mới: Nguyễn Thu Hà');
  expect(notification.Text).toContain('Số điện thoại: 0901 234 567');

  // 5. The lead is in the inbox, with the consent of the published version as evidence.
  await page.goto(`/sites/${site.id}`);
  await navigate(page, /^Leads/);
  await page.getByRole('link', { name: 'Nguyễn Thu Hà' }).click();
  const detail = page.getByRole('complementary', { name: 'Nguyễn Thu Hà' });
  await expect(detail).toContainText(`Đồng ý để ${PRIVACY.controllerName} xử lý dữ liệu`);
  await expect(detail).toContainText('Nội dung đồng ý bản 1');
  await expect(detail.getByRole('region', { name: 'Đã gửi tới' })).toContainText(
    'Email thông báo · 1 người nhận',
  );

  // 6. "Hiệu quả" counts the view and the lead.
  await navigate(page, 'Hiệu quả');
  await expect(kpi(page, 'Lượt xem')).toHaveText('1');
  await expect(kpi(page, 'Lead')).toHaveText('1');

  // 7. The person asks for deletion; the owner records it and deletes their data.
  await navigate(page, 'Dữ liệu & đồng ý');
  const requests = page.getByRole('region', { name: 'Yêu cầu từ người gửi form' });
  await requests.getByRole('button', { name: 'Ghi nhận yêu cầu' }).click();
  const record = page.getByRole('dialog', { name: 'Ghi nhận yêu cầu' });
  await record.getByRole('textbox', { name: /Họ tên/ }).fill('Nguyễn Thu Hà');
  await record.getByRole('textbox', { name: 'Số điện thoại' }).fill('0901 234 567');
  await record.getByRole('radio', { name: /Xóa toàn bộ dữ liệu/ }).check();
  await record.getByRole('button', { name: 'Ghi nhận' }).click();
  await expect(record).toBeHidden();
  await requests.getByRole('button', { name: 'Xử lý yêu cầu của Nguyễn Thu Hà' }).click();
  const handle = page.getByRole('dialog', { name: 'Xóa toàn bộ dữ liệu' });
  await expect(
    handle.getByRole('list', { name: 'Lead của người này' }).getByRole('listitem'),
  ).toHaveCount(1);
  await handle.getByRole('button', { name: 'Xóa dữ liệu và hoàn tất' }).click();
  await handle.getByRole('button', { name: 'Xác nhận' }).click();
  await expect(handle.getByText(/Dữ liệu của người này đã được xóa/)).toBeVisible();
  await handle.getByRole('button', { name: 'Đóng' }).last().click();

  await navigate(page, /^Leads/);
  await page.goto(`/sites/${site.id}/leads?range=all`);
  await expect(page.getByRole('region', { name: 'Danh sách lead' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Nguyễn Thu Hà' })).toHaveCount(0);
  await navigate(page, 'Hiệu quả');
  await expect(kpi(page, 'Lead')).toHaveText('0');
});
