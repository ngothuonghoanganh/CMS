import { expect, type Page, test } from '@playwright/test';
import {
  billingSummaryOf,
  dateOf,
  DAY_MS,
  dayMonth,
  fullDate,
  MINUTE_MS,
  setBillingClock,
} from '../support/billing-clock.js';
import { waitForEmail } from '../support/mailpit.js';
import {
  addCardViaGateway,
  CARD_INSUFFICIENT_FUNDS,
  CARD_OK,
  paymentsPath,
} from '../support/payments.js';
import { setUpSite } from '../support/setup.js';

/*
 * T3 (ADR-035): the life of a plan after T2. The billing test clock moves the API's time; moving it
 * runs the work that is due at the new time (the E2E API has no timer): the charge at the end of a
 * trial or period, retries and the end of the grace, a scheduled change, "Hủy gói". Boards 28 and 29.
 */

const INVOICE_NUMBER = /HD-\d{4}-\d{6}/;

function history(page: Page) {
  return page.getByRole('table', { name: 'Lịch sử giao dịch' });
}

/** A new workspace on its Agency trial, with the card saved on the fake gateway. */
async function trialWithCard(page: Page, card: string) {
  const fixture = await setUpSite(page.request);
  const workspaceId = fixture.site.workspaceId;
  await addCardViaGateway(page, workspaceId, card);
  const summary = await billingSummaryOf(page.request, workspaceId);
  return { ...fixture, workspaceId, summary };
}

/** Board 28's dialog on "Gói Doanh nghiệp" monthly, paid now with the saved card. */
async function payForBusiness(page: Page, workspaceId: string) {
  await page.goto(`/workspaces/${workspaceId}/billing`);
  await page.getByRole('button', { name: 'Đổi gói' }).click();
  const dialog = page.getByRole('dialog', { name: 'Đổi gói' });
  await dialog.getByRole('radio', { name: /^Gói Doanh nghiệp/ }).check();
  await dialog.getByRole('button', { name: 'Theo tháng' }).click();
  await dialog.getByRole('button', { name: 'Thanh toán ngay 1.490.000 ₫' }).click();
  await expect(page.getByText('Đã đổi sang Gói Doanh nghiệp', { exact: true })).toBeVisible();
}

test.describe('T3 · renewals, failed charges, transfers, scheduled changes and cancel', () => {
  test.afterEach(async ({ request }) => {
    await setBillingClock(request, null);
  });

  test('the trial ends with a charge of the first period, then the period renews', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const { account, workspaceId, summary } = await trialWithCard(page, CARD_OK);
    const trialEndsAt = dateOf(summary.trialEndsAt);

    // Board 28 tells what happens at the end of the trial.
    await page.goto(`/workspaces/${workspaceId}/billing`);
    await expect(page.getByText(/^Dùng thử từ .* tự thanh toán 599\.000 ₫/)).toBeVisible();

    // Three days before: the reminder email, with the amount and the card.
    await setBillingClock(request, new Date(trialEndsAt.getTime() - 2.5 * DAY_MS));
    const reminder = await waitForEmail(request, account.email, 'Dùng thử Mây Xanh Agency còn');
    expect(reminder.Text).toContain('599.000 ₫');
    expect(reminder.Text).toContain('Visa •••• 4242');

    // The end of the trial: the card is charged for the first period.
    await setBillingClock(request, new Date(trialEndsAt.getTime() + MINUTE_MS));
    const receipt = await waitForEmail(request, account.email, 'Biên nhận HD-');
    expect(receipt.Text).toContain('Thẻ Visa •••• 4242');
    await page.goto(`/workspaces/${workspaceId}/billing`);
    await expect(page.getByRole('heading', { level: 2, name: 'Gói Agency' })).toBeVisible();
    await expect(page.getByText('Đang hoạt động').first()).toBeVisible();
    await expect(page.getByText(/gia hạn tự động/)).toBeVisible();
    await page.goto(paymentsPath(workspaceId));
    let rows = history(page).getByRole('row').filter({ hasText: INVOICE_NUMBER });
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Đã thanh toán');
    await expect(rows.first()).toContainText('599.000 ₫');

    // The period ends: a renewal invoice is made and paid, and a second receipt is sent.
    const paid = await billingSummaryOf(page.request, workspaceId);
    await setBillingClock(request, new Date(dateOf(paid.periodEnd).getTime() + MINUTE_MS));
    await page.goto(paymentsPath(workspaceId));
    rows = history(page).getByRole('row').filter({ hasText: INVOICE_NUMBER });
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('Đã thanh toán');
    const after = await billingSummaryOf(page.request, workspaceId);
    expect(after.state).toBe('active');
    expect(dateOf(after.periodEnd).getTime()).toBeGreaterThan(dateOf(paid.periodEnd).getTime());
  });

  test('a declined charge shows the retry date, retries twice, then the workspace is read-only', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const { account, site, workspaceId, summary } = await trialWithCard(
      page,
      CARD_INSUFFICIENT_FUNDS,
    );

    await setBillingClock(request, new Date(dateOf(summary.trialEndsAt).getTime() + MINUTE_MS));
    const failed = await billingSummaryOf(page.request, workspaceId);
    expect(failed.state).toBe('past_due');
    const failedSince = dateOf(failed.failedSince);
    const firstRetry = dateOf(failed.nextRetryAt);
    expect(firstRetry.getTime() - failedSince.getTime()).toBeCloseTo(2 * DAY_MS, -4);

    // Board 28: the banner names the invoice, the reason and the day of the next try.
    await page.goto(`/workspaces/${workspaceId}/billing`);
    const banner = page.getByRole('alert').filter({ hasText: /Thanh toán kỳ \d{2}\/\d{2} chưa/ });
    await expect(banner).toContainText('Thẻ không đủ hạn mức');
    await expect(banner).toContainText(`Hệ thống tự thử lại ngày ${dayMonth(firstRetry)}.`);
    await expect(banner).toContainText(`chỉ đọc từ ${fullDate(dateOf(failed.graceEndsAt))}`);
    await expect(page.getByText('Quá hạn').first()).toBeVisible();
    const email = await waitForEmail(request, account.email, 'Chưa gia hạn được Mây Xanh Agency');
    expect(email.Text).toContain('Thẻ không đủ hạn mức');

    // Board 29: the same banner with the buttons to pay again, change the card or pay by transfer.
    await page.goto(paymentsPath(workspaceId));
    const alert = page.getByRole('alert').filter({ hasText: 'không thành công' });
    await expect(alert).toContainText(`Hệ thống tự thử lại ngày ${dayMonth(firstRetry)}.`);
    for (const name of ['Thanh toán lại', 'Đổi phương thức', 'Chuyển khoản']) {
      await expect(alert.getByRole('button', { name })).toBeVisible();
    }

    // The first retry runs on day 2 and is declined again; the second is on day 5.
    await setBillingClock(request, new Date(firstRetry.getTime() + MINUTE_MS));
    const retried = await billingSummaryOf(page.request, workspaceId);
    expect(retried.state).toBe('past_due');
    const lastRetry = dateOf(retried.nextRetryAt);
    expect(lastRetry.getTime()).toBeGreaterThan(firstRetry.getTime());
    await page.goto(`/workspaces/${workspaceId}/billing`);
    await expect(
      page.getByRole('alert').filter({ hasText: `thử lại ngày ${dayMonth(lastRetry)}.` }),
    ).toBeVisible();

    // After the last retry there is none left.
    await setBillingClock(request, new Date(lastRetry.getTime() + MINUTE_MS));
    await page.goto(`/workspaces/${workspaceId}/billing`);
    await expect(
      page.getByRole('alert').filter({ hasText: 'Hệ thống đã hết lượt tự thử lại.' }),
    ).toBeVisible();
    // Every page of the workspace says how long it has left.
    await page.goto(`/sites/${site.id}`);
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: /Thanh toán lỗi — còn \d+ ngày trước khi chỉ đọc/ }),
    ).toBeVisible();

    // The grace is over: read-only, with the email that says so.
    await setBillingClock(request, new Date(dateOf(failed.graceEndsAt).getTime() + MINUTE_MS));
    const readOnly = await billingSummaryOf(page.request, workspaceId);
    expect(readOnly.access).toBe('read_only');
    await page.goto(`/workspaces/${workspaceId}/billing`);
    await expect(page.getByText('Workspace đang ở chế độ chỉ đọc').first()).toBeVisible();
    await waitForEmail(request, account.email, 'đã chuyển sang chế độ chỉ đọc');
  });

  test('a bank transfer: the instructions show, the fake bank confirms, the invoice is paid', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const { account, workspaceId, summary } = await trialWithCard(page, CARD_INSUFFICIENT_FUNDS);
    await setBillingClock(request, new Date(dateOf(summary.trialEndsAt).getTime() + MINUTE_MS));

    await page.goto(paymentsPath(workspaceId));
    const alert = page.getByRole('alert').filter({ hasText: 'không thành công' });
    await alert.getByRole('button', { name: 'Chuyển khoản' }).click();
    const transfer = page.getByRole('region', { name: /^Chuyển khoản hóa đơn HD-/ });
    await expect(transfer.getByText('Đang chờ xác nhận')).toBeVisible();
    await expect(transfer.getByText('Ngân hàng thử (cổng thanh toán giả)')).toBeVisible();
    await expect(transfer.getByText('0000000000')).toBeVisible();
    await expect(transfer.getByText('PAYLOAD LANDING PAGE')).toBeVisible();
    await expect(transfer.getByText('599.000 ₫')).toBeVisible();
    await expect(transfer.getByText(INVOICE_NUMBER).first()).toBeVisible();
    await expect(
      transfer.getByRole('img', { name: /^Mã QR chuyển khoản 599\.000 ₫/ }),
    ).toBeVisible();
    const row = history(page).getByRole('row').filter({ hasText: INVOICE_NUMBER });
    await expect(row).toContainText('Đang chờ xác nhận');
    await expect(row).toContainText('Chờ nhận chuyển khoản');

    // Board 28 waits with it.
    await page.goto(`/workspaces/${workspaceId}/billing`);
    await expect(
      page.getByRole('status').filter({ hasText: 'Đang chờ xác nhận chuyển khoản.' }),
    ).toBeVisible();

    // The bank's page, then the browser comes back to board 29 with the invoice paid.
    await page.goto(paymentsPath(workspaceId));
    await page.getByRole('link', { name: 'Mở trang chuyển khoản của cổng thanh toán' }).click();
    await expect(page).toHaveURL(/\/api\/public\/billing\/fake-gateway\/transfer\?session=/);
    await expect(page.getByRole('heading', { level: 1, name: 'Chuyển khoản' })).toBeVisible();
    await expect(page.getByText('Cổng thanh toán thử')).toBeVisible();
    await page.getByRole('button', { name: 'Xác nhận đã nhận tiền' }).click();
    await expect(page).toHaveURL(new RegExp(`${paymentsPath(workspaceId)}$`));
    await expect(page.getByText('Đã nhận được chuyển khoản')).toBeVisible();
    await expect(history(page).getByRole('row').filter({ hasText: INVOICE_NUMBER })).toContainText(
      'Đã thanh toán',
    );
    const receipt = await waitForEmail(request, account.email, 'Biên nhận HD-');
    expect(receipt.Text).toContain('Chuyển khoản');

    await page.goto(`/workspaces/${workspaceId}/billing`);
    await expect(page.getByText('Đang hoạt động').first()).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Gói Agency' })).toBeVisible();
  });

  test('a downgrade is scheduled with its impacts, can be dropped, and applies at the end of the period', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const { workspaceId } = await trialWithCard(page, CARD_OK);
    await payForBusiness(page, workspaceId);

    await page.getByRole('button', { name: 'Đổi gói' }).click();
    const dialog = page.getByRole('dialog', { name: 'Đổi gói' });
    await dialog.getByRole('radio', { name: /^Gói Cơ bản/ }).check();
    await expect(dialog.getByRole('list', { name: 'Điều gì thay đổi' })).toBeVisible();
    await expect(dialog.getByText('Phần còn lại của kỳ này không được hoàn tiền.')).toBeVisible();
    const paid = await billingSummaryOf(page.request, workspaceId);
    const periodEnd = dateOf(paid.periodEnd);
    await expect(dialog.getByText(`từ ${fullDate(periodEnd)}`).first()).toBeVisible();
    await dialog.getByRole('button', { name: 'Lên lịch hạ gói' }).click();
    await expect(page.getByText('Đã lên lịch đổi gói', { exact: true })).toBeVisible();
    const strip = page.getByText(/^Chuyển sang Gói Cơ bản · theo tháng từ /);
    await expect(strip).toContainText(fullDate(periodEnd));
    // The plan is still Doanh nghiệp until then.
    await expect(page.getByRole('heading', { level: 2, name: 'Gói Doanh nghiệp' })).toBeVisible();

    await page.getByRole('button', { name: 'Hủy thay đổi' }).click();
    await expect(page.getByText('Đã hủy thay đổi đã lên lịch', { exact: true })).toBeVisible();
    await expect(strip).toHaveCount(0);

    // Scheduled again, it applies when the period ends: Cơ bản is charged.
    await page.getByRole('button', { name: 'Đổi gói' }).click();
    await dialog.getByRole('radio', { name: /^Gói Cơ bản/ }).check();
    await dialog.getByRole('button', { name: 'Lên lịch hạ gói' }).click();
    await expect(strip).toBeVisible();
    await setBillingClock(request, new Date(periodEnd.getTime() + MINUTE_MS));
    await page.goto(`/workspaces/${workspaceId}/billing`);
    await expect(page.getByRole('heading', { level: 2, name: 'Gói Cơ bản' })).toBeVisible();
    await expect(strip).toHaveCount(0);
    await page.goto(paymentsPath(workspaceId));
    const renewal = history(page).getByRole('row').filter({ hasText: '199.000 ₫' });
    await expect(renewal).toHaveCount(1);
    await expect(renewal).toContainText('Đã thanh toán');
  });

  test('cancel, keep the plan, cancel again, the plan stops, and a new payment starts it again', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const { workspaceId } = await trialWithCard(page, CARD_OK);
    await payForBusiness(page, workspaceId);
    const paid = await billingSummaryOf(page.request, workspaceId);
    const periodEnd = dateOf(paid.periodEnd);

    // "Hủy gói" asks first, and says what happens at the end of the period.
    await page.getByRole('button', { name: 'Hủy gói' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Hủy Gói Doanh nghiệp?' });
    await expect(confirm.getByRole('list', { name: 'Điều gì xảy ra khi hết kỳ' })).toBeVisible();
    await confirm.getByRole('button', { name: 'Giữ Gói Doanh nghiệp' }).click();
    await expect(confirm).toBeHidden();
    await expect(page.getByText('Đã hủy gói', { exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'Hủy gói' }).click();
    await confirm.getByRole('button', { name: 'Hủy gói' }).click();
    await expect(page.getByText('Đã hủy gói', { exact: true })).toBeVisible();
    await expect(page.getByText('Đã lên lịch hủy').first()).toBeVisible();
    await expect(page.getByText(`Gói sẽ dừng vào ${fullDate(periodEnd)}.`)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hủy gói' })).toHaveCount(0);
    await expect(page.getByText(/không gia hạn/)).toBeVisible();

    await page.getByRole('button', { name: 'Giữ lại gói' }).click();
    await expect(page.getByText('Đã giữ lại Gói Doanh nghiệp', { exact: true })).toBeVisible();
    await expect(page.getByText(/Gói sẽ dừng vào/)).toHaveCount(0);
    await expect(page.getByText(/gia hạn tự động/)).toBeVisible();

    // Canceled again, the period ends with no charge: the plan has stopped.
    await page.getByRole('button', { name: 'Hủy gói' }).click();
    await confirm.getByRole('button', { name: 'Hủy gói' }).click();
    await expect(page.getByText(`Gói sẽ dừng vào ${fullDate(periodEnd)}.`)).toBeVisible();
    await setBillingClock(request, new Date(periodEnd.getTime() + MINUTE_MS));
    const stopped = await billingSummaryOf(page.request, workspaceId);
    expect(stopped.state).toBe('canceled');
    await page.goto(`/workspaces/${workspaceId}/billing`);
    await expect(page.getByText(`Gói đã hủy từ ${fullDate(periodEnd)}.`)).toBeVisible();
    await expect(page.getByText('Đã hủy', { exact: true }).first()).toBeVisible();
    await page.goto(paymentsPath(workspaceId));
    await expect(history(page).getByRole('row').filter({ hasText: INVOICE_NUMBER })).toHaveCount(1);

    // "Chọn gói mới": the full price of a new period, from now, charged to the saved card.
    await page.goto(`/workspaces/${workspaceId}/billing`);
    await page.getByRole('button', { name: 'Chọn gói mới' }).click();
    const dialog = page.getByRole('dialog', { name: 'Đổi gói' });
    await dialog.getByRole('radio', { name: /^Gói Cơ bản/ }).check();
    await dialog.getByRole('button', { name: 'Theo tháng' }).click();
    await dialog.getByRole('button', { name: 'Thanh toán ngay 199.000 ₫' }).click();
    await expect(page.getByText('Đã đổi sang Gói Cơ bản', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Gói Cơ bản' })).toBeVisible();
    await expect(page.getByText('Đang hoạt động').first()).toBeVisible();
    const restarted = await billingSummaryOf(page.request, workspaceId);
    expect(restarted.state).toBe('active');
  });
});
