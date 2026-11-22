import { expect, type APIRequestContext, type Page, test } from '@playwright/test';
import {
  billingSummaryOf,
  dateOf,
  DAY_MS,
  fullDate,
  MINUTE_MS,
  setBillingClock,
} from '../support/billing-clock.js';
import { joinAs } from '../support/members.js';
import { MAILPIT, waitForEmail } from '../support/mailpit.js';
import { addCardViaGateway, CARD_OK, paymentsPath } from '../support/payments.js';
import { setUpSite } from '../support/setup.js';
import { urls } from '../urls.js';

/*
 * T4 (ADR-035): bank transfer as a way to renew a plan. The billing test clock moves the API's
 * time; moving it runs the work that is due. The invoice of the next period is issued
 * `transferLeadDays` (7) before the period ends; paid early, the next period starts at the old end
 * with no charge; unpaid, the workspace waits in the grace ("Chờ chuyển khoản", never a failed
 * payment). Boards 28 and 29.
 */

const LEAD_DAYS = 7;
const GRACE_DAYS = 7;
const INVOICE_NUMBER = /HD-\d{4}-\d{6}/;
const ISSUED_SUBJECT = 'Hóa đơn kỳ mới của';
const DUE_SUBJECT = 'Hôm nay là hạn chuyển khoản gói của';

function history(page: Page) {
  return page.getByRole('table', { name: 'Lịch sử giao dịch' });
}

/** How many emails to `to` carry `subject`; the shared Mailpit holds every test's mail. */
async function emailCount(request: APIRequestContext, to: string, subject: string) {
  const response = await request.get(
    `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
  );
  const { messages } = (await response.json()) as { messages: Array<{ Subject: string }> };
  return messages.filter((message) => message.Subject.includes(subject)).length;
}

/** A workspace in its first paid month (Agency, card saved and charged), renewing in `periodEnd`. */
async function paidMonth(page: Page, request: APIRequestContext) {
  const fixture = await setUpSite(page.request);
  const workspaceId = fixture.site.workspaceId;
  await addCardViaGateway(page, workspaceId, CARD_OK);
  const trial = await billingSummaryOf(page.request, workspaceId);
  await setBillingClock(request, new Date(dateOf(trial.trialEndsAt).getTime() + MINUTE_MS));
  const paid = await billingSummaryOf(page.request, workspaceId);
  expect(paid.state).toBe('active');
  return { ...fixture, workspaceId, periodEnd: dateOf(paid.periodEnd) };
}

/** Board 29's "Gia hạn bằng" on the page of payments. */
async function chooseRenewal(page: Page, workspaceId: string, label: RegExp) {
  await page.goto(paymentsPath(workspaceId));
  const group = page.getByRole('group', { name: 'Gia hạn bằng' });
  await group.getByRole('radio', { name: label }).click();
  return group;
}

const TRANSFER = /^Chuyển khoản ngân hàng/;
const CARD = /^Thẻ thanh toán tự động/;

test.describe('T4 · renewal by bank transfer', () => {
  test.afterEach(async ({ request }) => {
    await setBillingClock(request, null);
  });

  test('the invoice comes early, paid in advance the next period starts at the old end with no charge', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const { account, workspaceId, periodEnd } = await paidMonth(page, request);

    const group = await chooseRenewal(page, workspaceId, TRANSFER);
    await expect(
      page.getByText('Gia hạn bằng chuyển khoản ngân hàng', { exact: true }),
    ).toBeVisible();
    await expect(group.getByRole('radio', { name: TRANSFER })).toBeChecked();
    await expect(
      page.getByRole('status').filter({ hasText: 'Hóa đơn kỳ sau (599.000 ₫)' }),
    ).toBeVisible();
    // Board 28 says it in the period line.
    await page.goto(`/workspaces/${workspaceId}/billing`);
    await expect(page.getByText(/chuyển khoản 599\.000 ₫, hóa đơn gửi/)).toBeVisible();

    // The lead day: the invoice is issued and the email goes out once.
    const leadDay = new Date(periodEnd.getTime() - LEAD_DAYS * DAY_MS + MINUTE_MS);
    await setBillingClock(request, leadDay);
    const issued = await waitForEmail(request, account.email, ISSUED_SUBJECT);
    expect(issued.Subject).toContain(`chuyển khoản trước ${fullDate(periodEnd)}`);
    expect(issued.Text).toContain('599.000 ₫');
    expect(issued.Text).toMatch(/PLP HD-\d{4}-\d{6}/);
    await setBillingClock(request, new Date(leadDay.getTime() + 2 * MINUTE_MS));
    expect(await emailCount(request, account.email, ISSUED_SUBJECT)).toBe(1);

    await page.goto(paymentsPath(workspaceId));
    const callout = page.getByRole('status').filter({ hasText: /^Hóa đơn gia hạn HD-/ });
    await expect(callout).toContainText('599.000 ₫');
    await expect(callout).toContainText(`chuyển khoản trước ${fullDate(periodEnd)}`);
    const details = page.getByRole('region', { name: /^Chuyển khoản hóa đơn gia hạn HD-/ });
    await expect(
      details.getByRole('img', { name: /^Mã QR chuyển khoản 599\.000 ₫/ }),
    ).toBeVisible();
    await expect(details.getByText('Ngân hàng thử (cổng thanh toán giả)')).toBeVisible();
    await expect(details.getByText(/^PLP HD-/)).toBeVisible();

    // The fake bank confirms the money; the next period is paid, the current one goes on.
    await page.getByRole('link', { name: 'Mở trang chuyển khoản của cổng thanh toán' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Chuyển khoản' })).toBeVisible();
    await page.getByRole('button', { name: 'Xác nhận đã nhận tiền' }).click();
    await expect(page).toHaveURL(new RegExp(`${paymentsPath(workspaceId)}$`));
    await expect(page.getByText('Kỳ sau đã được thanh toán', { exact: true })).toBeVisible();
    const receipt = await waitForEmail(request, account.email, 'Biên nhận HD-');
    expect(receipt.Text).toContain('Chuyển khoản');
    const prepaid = await billingSummaryOf(page.request, workspaceId);
    expect(prepaid.state).toBe('active');
    expect(dateOf(prepaid.periodEnd).getTime()).toBe(periodEnd.getTime());
    expect(prepaid.renewal?.paid).toBe(true);

    // Board 28 hides the changes that would void a paid period and says why.
    await page.goto(`/workspaces/${workspaceId}/billing`);
    await expect(
      page.getByText(/Kỳ sau đã thanh toán nên đổi gói và hủy gói được từ/),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hủy gói' })).toHaveCount(0);

    // The old period ends: the new one starts there, with no new invoice and no card charge.
    await setBillingClock(request, new Date(periodEnd.getTime() + MINUTE_MS));
    const renewed = await billingSummaryOf(page.request, workspaceId);
    expect(renewed.state).toBe('active');
    expect(dateOf(renewed.periodStart).getTime()).toBe(periodEnd.getTime());
    expect(dateOf(renewed.periodEnd).getTime()).toBeGreaterThan(periodEnd.getTime());
    await page.goto(paymentsPath(workspaceId));
    const rows = history(page).getByRole('row').filter({ hasText: INVOICE_NUMBER });
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: 'Đã thanh toán' })).toHaveCount(2);
    await expect(history(page).getByText('Thẻ Visa •••• 4242')).toHaveCount(1);
    expect(await emailCount(request, account.email, DUE_SUBJECT)).toBe(0);
  });

  test('unpaid at the end of the period it waits for the transfer, then read-only, then a transfer reopens it', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const { account, site, workspaceId, periodEnd } = await paidMonth(page, request);
    await chooseRenewal(page, workspaceId, TRANSFER);
    await expect(
      page.getByRole('status').filter({ hasText: 'Hóa đơn kỳ sau (599.000 ₫)' }),
    ).toBeVisible();

    await setBillingClock(request, new Date(periodEnd.getTime() - LEAD_DAYS * DAY_MS + MINUTE_MS));
    await waitForEmail(request, account.email, ISSUED_SUBJECT);

    // The period ends with the invoice unpaid: the reminder, and no failed payment of any kind.
    await setBillingClock(request, new Date(periodEnd.getTime() + MINUTE_MS));
    await waitForEmail(request, account.email, DUE_SUBJECT);
    const waiting = await billingSummaryOf(page.request, workspaceId);
    expect(waiting.state).toBe('pending_payment');
    expect(waiting.awaitingTransfer).toBe(true);
    expect(waiting.failedSince).toBeNull();
    expect(waiting.nextRetryAt).toBeNull();
    const graceEnd = new Date(periodEnd.getTime() + GRACE_DAYS * DAY_MS);
    expect(dateOf(waiting.graceEndsAt).getTime()).toBe(graceEnd.getTime());

    await page.goto(`/workspaces/${workspaceId}/billing`);
    const banner = page.getByRole('status').filter({ hasText: 'Chờ chuyển khoản' });
    await expect(banner.first()).toContainText(fullDate(graceEnd));
    await expect(page.getByRole('link', { name: 'Xem thông tin chuyển khoản' })).toBeVisible();
    await expect(page.getByText(/chưa thành công|không thành công/)).toHaveCount(0);
    await page.goto(`/sites/${site.id}`);
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: /Chờ chuyển khoản — còn \d+ ngày trước khi chỉ đọc/ }),
    ).toBeVisible();

    await page.goto(paymentsPath(workspaceId));
    const callout = page.getByRole('status').filter({ hasText: /^Chờ chuyển khoản hóa đơn HD-/ });
    await expect(callout).toContainText('599.000 ₫');
    await expect(callout.getByRole('button', { name: 'Xem thông tin chuyển khoản' })).toBeVisible();
    await expect(
      callout.getByRole('button', { name: 'Thanh toán bằng thẻ thay thế' }),
    ).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'không thành công' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Thanh toán lại' })).toHaveCount(0);
    expect(await emailCount(request, account.email, 'Chưa gia hạn được')).toBe(0);

    // No retry runs while the workspace waits.
    await setBillingClock(request, new Date(periodEnd.getTime() + 3 * DAY_MS));
    const later = await billingSummaryOf(page.request, workspaceId);
    expect(later.state).toBe('pending_payment');
    expect(later.failedSince).toBeNull();
    expect(await emailCount(request, account.email, 'Chưa gia hạn được')).toBe(0);

    // The grace is over: read-only, with the email that says so.
    await setBillingClock(request, new Date(graceEnd.getTime() + MINUTE_MS));
    await waitForEmail(request, account.email, 'đã chuyển sang chế độ chỉ đọc');
    const readOnly = await billingSummaryOf(page.request, workspaceId);
    expect(readOnly.access).toBe('read_only');
    await page.goto(paymentsPath(workspaceId));
    // Read-only, the banner is an alert, as on board 28.
    await expect(
      page.getByRole('alert').filter({ hasText: /^Chờ chuyển khoản hóa đơn HD-/ }),
    ).toContainText('chế độ chỉ đọc');

    // The transfer arrives late: the plan is active again.
    await page.getByRole('link', { name: 'Mở trang chuyển khoản của cổng thanh toán' }).click();
    await page.getByRole('button', { name: 'Xác nhận đã nhận tiền' }).click();
    await expect(page).toHaveURL(new RegExp(`${paymentsPath(workspaceId)}$`));
    await expect(
      history(page).getByRole('row').filter({ hasText: INVOICE_NUMBER }).first(),
    ).toContainText('Đã thanh toán');
    const active = await billingSummaryOf(page.request, workspaceId);
    expect(active.state).toBe('active');
    expect(active.access).not.toBe('read_only');
  });

  test('a downgrade scheduled while the early invoice waits replaces it', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const { account, workspaceId, periodEnd } = await paidMonth(page, request);
    await chooseRenewal(page, workspaceId, TRANSFER);
    await setBillingClock(request, new Date(periodEnd.getTime() - LEAD_DAYS * DAY_MS + MINUTE_MS));
    const first = await waitForEmail(request, account.email, ISSUED_SUBJECT);
    const oldNumber = INVOICE_NUMBER.exec(first.Text)?.[0];
    expect(oldNumber).toBeDefined();

    await page.goto(`/workspaces/${workspaceId}/billing`);
    await page.getByRole('button', { name: 'Đổi gói' }).click();
    const dialog = page.getByRole('dialog', { name: 'Đổi gói' });
    await dialog.getByRole('radio', { name: /^Gói Cơ bản/ }).check();
    await expect(dialog.getByText('Hóa đơn chuyển khoản đang chờ sẽ bị thay')).toBeVisible();
    await expect(dialog.getByText(`Thông tin chuyển khoản của hóa đơn ${oldNumber}`)).toContainText(
      'không còn dùng được',
    );
    await dialog.getByRole('button', { name: 'Lên lịch hạ gói' }).click();
    await expect(page.getByText('Đã lên lịch đổi gói', { exact: true })).toBeVisible();

    // A second email carries the new invoice and names the one it replaces.
    const second = await waitForEmail(request, account.email, ISSUED_SUBJECT, first);
    const newNumber = INVOICE_NUMBER.exec(second.Text)?.[0];
    expect(newNumber).toBeDefined();
    expect(newNumber).not.toBe(oldNumber);
    expect(second.Text).toContain(oldNumber ?? '');
    expect(second.Text).toContain('199.000 ₫');

    await page.goto(paymentsPath(workspaceId));
    const rows = history(page).getByRole('row');
    await expect(rows.filter({ hasText: oldNumber ?? '' })).not.toContainText('Đang chờ xác nhận');
    await expect(
      page.getByRole('status').filter({ hasText: `Hóa đơn gia hạn ${newNumber}` }),
    ).toContainText('199.000 ₫');
    await expect(
      page.getByRole('region', { name: `Chuyển khoản hóa đơn gia hạn ${newNumber}` }),
    ).toBeVisible();
    expect(await emailCount(request, account.email, ISSUED_SUBJECT)).toBe(2);
  });

  test('switched back to the card while it waits, the card pays that same invoice at the end', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const { account, workspaceId, periodEnd } = await paidMonth(page, request);
    await chooseRenewal(page, workspaceId, TRANSFER);
    await setBillingClock(request, new Date(periodEnd.getTime() - LEAD_DAYS * DAY_MS + MINUTE_MS));
    const issued = await waitForEmail(request, account.email, ISSUED_SUBJECT);
    const number = INVOICE_NUMBER.exec(issued.Text)?.[0] ?? '';
    expect(number).not.toBe('');

    // By keyboard: the radio keeps the focus once the choice is saved, so the arrows go on.
    await page.goto(paymentsPath(workspaceId));
    const group = page.getByRole('group', { name: 'Gia hạn bằng' });
    const byCard = group.getByRole('radio', { name: CARD });
    await group.getByRole('radio', { name: TRANSFER }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(
      page.getByText('Gia hạn bằng thẻ thanh toán tự động', { exact: true }),
    ).toBeVisible();
    await expect(byCard).toBeChecked();
    await expect(byCard).toBeFocused();
    await expect(page.getByText('hệ thống trừ thẻ đã lưu cho hóa đơn này').first()).toBeVisible();

    await setBillingClock(request, new Date(periodEnd.getTime() + MINUTE_MS));
    const renewed = await billingSummaryOf(page.request, workspaceId);
    expect(renewed.state).toBe('active');
    expect(renewed.awaitingTransfer).toBe(false);
    await page.goto(paymentsPath(workspaceId));
    const rows = history(page).getByRole('row').filter({ hasText: INVOICE_NUMBER });
    // The first month and this renewal: no second invoice for the same period.
    await expect(rows).toHaveCount(2);
    const renewal = rows.filter({ hasText: number });
    await expect(renewal).toContainText('Đã thanh toán');
    await expect(renewal).toContainText('Thẻ Visa •••• 4242');
    await waitForEmail(request, account.email, 'Biên nhận HD-');
  });

  test('a member who cannot manage billing cannot change the method', async ({
    page,
    browser,
    request,
  }) => {
    test.setTimeout(120_000);
    const { site } = await setUpSite(page.request);
    const adminPage = await joinAs(page.request, browser, request, site.workspaceId, 'admin');
    try {
      await adminPage.goto(paymentsPath(site.workspaceId));
      await expect(
        adminPage.getByRole('heading', { name: 'Chỉ Chủ sở hữu xem được thanh toán' }),
      ).toBeVisible();
      await expect(adminPage.getByRole('group', { name: 'Gia hạn bằng' })).toHaveCount(0);
      const change = await adminPage.request.put(
        `${urls.admin}/api/workspaces/${site.workspaceId}/billing/renewal-method`,
        { data: { method: 'transfer' }, headers: { origin: urls.admin } },
      );
      expect(change.status()).toBe(403);
      const summary = await billingSummaryOf(page.request, site.workspaceId);
      expect(summary.renewalMethod).toBe('card');
    } finally {
      await adminPage.context().close();
    }
  });
});
