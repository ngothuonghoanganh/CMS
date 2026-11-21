import { expect, test } from '@playwright/test';
import { MINUTE_MS, dateOf, billingSummaryOf, setBillingClock } from '../support/billing-clock.js';
import {
  APARTMENT,
  GYM,
  openBuyDialog,
  priceBoxOf,
  tickAndPay,
} from '../support/marketplace-purchase.js';
import { waitForEmail } from '../support/mailpit.js';
import { joinAs } from '../support/members.js';
import {
  addCardViaGateway,
  CARD_DECLINED,
  CARD_INSUFFICIENT_FUNDS,
  CARD_OK,
  paymentsPath,
  saveCardAtGateway,
} from '../support/payments.js';
import { setUpSite } from '../support/setup.js';

/*
 * MP3 (ADR-036): buying a paid item through the fake gateway, from board 31's dialog to board 29's
 * row, the receipt and the emails. The money path itself (idempotency, hold, webhook, T3 job) is
 * the API's integration tests; this is the person's path.
 */

const year = new Date().getFullYear();
const INVOICE_NUMBER = new RegExp(`HD-${year}-\\d{6}`);

test.afterEach(async ({ request }) => {
  await setBillingClock(request, null);
});

test.describe('MP3 · Buying a marketplace item', () => {
  test('the owner buys an item: terms first, the licence, the row, the receipt and the email', async ({
    page,
    request,
    context,
  }) => {
    const { account, site } = await setUpSite(page.request);
    const workspace = `/workspaces/${site.workspaceId}`;
    await addCardViaGateway(page, site.workspaceId, CARD_OK);

    const dialog = await openBuyDialog(page, workspace, GYM.id);
    await expect(dialog).toContainText(`${GYM.name} · v1`);
    await expect(dialog).toContainText('399.000');
    await expect(dialog).toContainText('Đã gồm VAT');
    await expect(dialog).toContainText('Thẻ Visa •••• 4242');
    const terms = dialog.getByRole('checkbox', { name: 'Tôi đồng ý với điều khoản giấy phép' });
    await expect(terms).not.toBeChecked();
    await expect(dialog.getByRole('button', { name: /^Thanh toán \d/ })).toBeDisabled();
    await tickAndPay(dialog);

    await expect(dialog.getByText(`Đã mua “${GYM.name}”`).first()).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Sản phẩm đã mua' })).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Tạo trang từ mẫu' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Đóng' }).first().click();

    // Board 31 and 32 hold the licence.
    await expect(priceBoxOf(page).getByText('Workspace đã sở hữu · v1')).toBeVisible();
    await expect(priceBoxOf(page).getByRole('button', { name: 'Mua mẫu' })).toHaveCount(0);
    await page.goto(`${workspace}/marketplace/owned`);
    const rows = page.getByRole('region', { name: 'Template đã sở hữu' }).getByRole('listitem');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(GYM.name);
    await expect(rows.first()).toContainText('Mọi site trong workspace');

    // Board 29: the paid row, with no way to pay by transfer, and the receipt.
    await page.goto(paymentsPath(site.workspaceId));
    const history = page.getByRole('table', { name: 'Lịch sử giao dịch' });
    const row = history.getByRole('row').filter({ hasText: `Mẫu “${GYM.name}” · Marketplace` });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Đã thanh toán');
    await expect(row).toContainText('399.000');
    const [receipt] = await Promise.all([
      context.waitForEvent('page'),
      row.getByRole('link', { name: /^Tải hóa đơn HD-/ }).click(),
    ]);
    await expect(
      receipt.getByRole('heading', { level: 1, name: 'Biên nhận thanh toán' }),
    ).toBeVisible();
    await expect(receipt.getByText(GYM.name).first()).toBeVisible();
    await expect(receipt.getByText(/Phiên bản v1 · Một lần/)).toBeVisible();
    await receipt.close();

    // Mailpit: the receipt for the owner.
    const email = await waitForEmail(request, account.email, `Mẫu “${GYM.name}”`);
    expect(email.Subject).toMatch(/^Biên nhận HD-\d{4}-\d{6} · Mẫu “/);
    expect(email.Text).toContain('Thẻ Visa •••• 4242');
    expect(email.Text).toContain(`/workspaces/${site.workspaceId}/templates/${GYM.id}`);
    expect(email.Text).toMatch(INVOICE_NUMBER);
  });

  test('a declined card buys nothing; "Đổi phương thức" with a valid card does', async ({
    page,
  }) => {
    const { site } = await setUpSite(page.request);
    const workspace = `/workspaces/${site.workspaceId}`;
    await addCardViaGateway(page, site.workspaceId, CARD_DECLINED);

    let dialog = await openBuyDialog(page, workspace, APARTMENT.id);
    await tickAndPay(dialog);
    const declined = dialog.getByRole('alert').filter({ hasText: 'Ngân hàng từ chối thẻ' });
    await expect(declined).toContainText('Bạn chưa bị trừ tiền và chưa sở hữu mẫu.');
    await dialog.getByRole('button', { name: 'Đổi phương thức' }).click();
    await saveCardAtGateway(page, CARD_OK);
    await expect(page).toHaveURL(new RegExp(`${workspace}/marketplace/${APARTMENT.id}`));

    dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Đã lưu thẻ', { exact: true })).toBeVisible();
    await tickAndPay(dialog);
    await expect(dialog.getByText(`Đã mua “${APARTMENT.name}”`).first()).toBeVisible();

    // The refused invoice was voided by the new purchase: one paid row, nothing waiting to pay.
    await page.goto(paymentsPath(site.workspaceId));
    const history = page.getByRole('table', { name: 'Lịch sử giao dịch' });
    await expect(
      history
        .getByRole('row')
        .filter({ hasText: `Mẫu “${APARTMENT.name}” · Marketplace` })
        .filter({ hasText: 'Đã thanh toán' }),
    ).toHaveCount(1);
    await expect(page.getByRole('button', { name: /^Thanh toán lại/ })).toHaveCount(0);
  });

  test('a double click on "Thanh toán" buys once', async ({ page }) => {
    const { site } = await setUpSite(page.request);
    const workspace = `/workspaces/${site.workspaceId}`;
    await addCardViaGateway(page, site.workspaceId, CARD_OK);
    const purchases: string[] = [];
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().endsWith('/marketplace/purchases')) {
        purchases.push(req.url());
      }
    });

    const dialog = await openBuyDialog(page, workspace, GYM.id);
    await dialog.getByRole('checkbox', { name: 'Tôi đồng ý với điều khoản giấy phép' }).check();
    await dialog.getByRole('button', { name: /^Thanh toán \d/ }).dblclick();
    await expect(dialog.getByText(`Đã mua “${GYM.name}”`).first()).toBeVisible();
    expect(purchases).toHaveLength(1);

    await page.goto(paymentsPath(site.workspaceId));
    const history = page.getByRole('table', { name: 'Lịch sử giao dịch' });
    await expect(history.getByRole('row').filter({ hasText: 'Marketplace' })).toHaveCount(1);
  });

  test('a member who cannot pay suggests the item once; the owner gets one email', async ({
    page,
    browser,
    request,
  }) => {
    const { account, site } = await setUpSite(page.request);
    const workspace = `/workspaces/${site.workspaceId}`;
    const editor = await joinAs(page.request, browser, request, site.workspaceId, 'editor', [
      site.id,
    ]);
    try {
      await editor.goto(`${workspace}/marketplace/${GYM.id}`);
      const box = priceBoxOf(editor);
      await expect(box.getByRole('button', { name: 'Mua mẫu' })).toHaveCount(0);
      await box.getByRole('button', { name: `Đề xuất ${account.name} mua` }).click();
      await expect(box.getByText(`Đã đề xuất ${account.name} mua`)).toBeVisible();
      await expect(box.getByRole('button', { name: /^Đề xuất/ })).toHaveCount(0);

      const email = await waitForEmail(request, account.email, `đề xuất mua mẫu “${GYM.name}”`);
      expect(email.Text).toContain(`/workspaces/${site.workspaceId}/marketplace/${GYM.id}`);

      // Asking again, from a fresh load, says it is sent and sends nothing.
      await editor.reload();
      await expect(priceBoxOf(editor).getByText(`Đã đề xuất ${account.name} mua`)).toBeVisible();
      await expect(priceBoxOf(editor).getByRole('button', { name: /^Đề xuất/ })).toHaveCount(0);
      const found = await request.get(
        `http://localhost:8125/api/v1/search?query=${encodeURIComponent(`to:"${account.email}" subject:"đề xuất mua mẫu"`)}`,
      );
      const { messages } = (await found.json()) as { messages: unknown[] };
      expect(messages).toHaveLength(1);
    } finally {
      await editor.context().close();
    }
  });

  test('a read-only workspace cannot buy, nor pay a refused purchase again, and a marketplace invoice offers no transfer', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const { site } = await setUpSite(page.request);
    const workspaceId = site.workspaceId;
    const workspace = `/workspaces/${workspaceId}`;

    // A purchase refused by the card, so that its invoice sits on board 29 as failed.
    await addCardViaGateway(page, workspaceId, CARD_DECLINED);
    let dialog = await openBuyDialog(page, workspace, GYM.id);
    await tickAndPay(dialog);
    await expect(
      dialog.getByRole('alert').filter({ hasText: 'Ngân hàng từ chối thẻ' }),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Đóng' }).first().click();
    await page.goto(paymentsPath(workspaceId));
    const row = page
      .getByRole('table', { name: 'Lịch sử giao dịch' })
      .getByRole('row')
      .filter({ hasText: `Mẫu “${GYM.name}” · Marketplace` });
    await expect(row.getByRole('button', { name: /^Thanh toán lại/ })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Chuyển khoản' })).toHaveCount(0);

    // The trial ends with a card that cannot pay; after the grace the workspace is read-only.
    await addCardViaGateway(page, workspaceId, CARD_INSUFFICIENT_FUNDS);
    const trial = await billingSummaryOf(page.request, workspaceId);
    await setBillingClock(request, new Date(dateOf(trial.trialEndsAt).getTime() + MINUTE_MS));
    const failed = await billingSummaryOf(page.request, workspaceId);
    await setBillingClock(request, new Date(dateOf(failed.graceEndsAt).getTime() + MINUTE_MS));
    expect((await billingSummaryOf(page.request, workspaceId)).access).toBe('read_only');

    // Paying the refused purchase again would buy the item anew: no longer offered (ADR-036).
    await page.goto(paymentsPath(workspaceId));
    await expect(row).toContainText('Ngân hàng từ chối thẻ');
    await expect(row.getByRole('button', { name: /^Thanh toán lại/ })).toHaveCount(0);

    dialog = await openBuyDialog(page, workspace, APARTMENT.id);
    await tickAndPay(dialog);
    await expect(dialog.getByRole('link', { name: 'Xem gói & thanh toán' })).toBeVisible();
    await expect(dialog.getByText(`Đã mua “${APARTMENT.name}”`)).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.goto(`${workspace}/marketplace/owned`);
    await expect(
      page.getByRole('heading', { name: 'Workspace chưa có mẫu nào từ Marketplace' }),
    ).toBeVisible();
  });
});
