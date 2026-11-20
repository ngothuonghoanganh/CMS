import { expect, type Page, test } from '@playwright/test';
import { joinAs } from '../support/members.js';
import { addCardViaGateway, CARD_DECLINED, CARD_OK, paymentsPath } from '../support/payments.js';
import { changePlanViaApi, setUpSite } from '../support/setup.js';
import { urls } from '../urls.js';

/*
 * T2 (ADR-035): the owner adds a card on the fake gateway, fills the billing information, pays for
 * Gói Doanh nghiệp ("Thanh toán ngay" ends the trial and charges the first period), reads the
 * receipt; a declined card leaves the plan as it was and the invoice can be paid again; an Admin
 * sees plans and usage but no payments (boards 28 and 29).
 */

const year = new Date().getFullYear();
const INVOICE_NUMBER = new RegExp(`HD-${year}-\\d{6}`);

/** Board 28's dialog on "Gói Doanh nghiệp" monthly, down to the "Thanh toán ngay" button. */
async function chooseBusinessAndPay(page: Page, workspaceId: string) {
  await page.goto(`/workspaces/${workspaceId}/billing`);
  await page.getByRole('button', { name: 'Đổi gói' }).click();
  const dialog = page.getByRole('dialog', { name: 'Đổi gói' });
  await dialog.getByRole('radio', { name: /^Gói Doanh nghiệp/ }).check();
  await dialog.getByRole('button', { name: 'Theo tháng' }).click();
  const pay = dialog.getByRole('button', { name: 'Thanh toán ngay 1.490.000 ₫' });
  await expect(pay).toBeEnabled();
  return { dialog, pay };
}

test.describe('T2 · cards, billing information, paid plan and receipts', () => {
  test('the owner adds a card, saves billing info, pays for Doanh nghiệp and opens the receipt', async ({
    page,
    context,
  }) => {
    const { site } = await setUpSite(page.request);
    const workspaceId = site.workspaceId;
    await changePlanViaApi(page.request, workspaceId, 'basic');

    // Board 29 with no card, then the fake gateway's page and back with the card saved.
    await page.goto(`/workspaces/${workspaceId}/billing`);
    await page
      .getByRole('navigation', { name: 'Gói và thanh toán' })
      .getByRole('link', { name: 'Thanh toán & hóa đơn' })
      .click();
    await expect(page).toHaveURL(new RegExp(`${paymentsPath(workspaceId)}$`));
    await expect(page.getByText('Chưa có phương thức thanh toán.')).toBeVisible();
    await addCardViaGateway(page, workspaceId, CARD_OK);
    await expect(page.getByText('Thẻ Visa •••• 4242', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('MẶC ĐỊNH', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Đổi thẻ' })).toBeVisible();
    // The return parameter is gone: a reload does not repeat the notice.
    await expect(page).toHaveURL(new RegExp(`${paymentsPath(workspaceId)}$`));

    // Billing information: a tax code of the wrong length shows its message, a valid one saves.
    await page.getByRole('button', { name: 'Nhập thông tin' }).click();
    await page.getByLabel('Tên đơn vị').fill('Công ty TNHH Mây Xanh');
    await page.getByLabel('Mã số thuế').fill('12345');
    await page.getByLabel('Địa chỉ').fill('12 Lê Lợi, Quận 1, TP. Hồ Chí Minh');
    await page.getByLabel('Email nhận hóa đơn điện tử').fill('ketoan@mayxanh.example.com');
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(page.getByText(/Mã số thuế gồm 10/).first()).toBeVisible();
    await page.getByLabel('Mã số thuế').fill('0123456789001');
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(page.getByText('Đã lưu thông tin xuất hóa đơn')).toBeVisible();
    await expect(page.getByText('0123456789-001')).toBeVisible();

    // Board 28: Doanh nghiệp monthly is a free change or "Thanh toán ngay", which charges the card.
    const { dialog, pay } = await chooseBusinessAndPay(page, workspaceId);
    await expect(dialog.getByText('Số tiền thanh toán ngay: 1.490.000 ₫')).toBeVisible();
    await expect(dialog.getByText('Trừ vào Thẻ Visa •••• 4242.')).toBeVisible();
    await pay.click();
    await expect(page.getByText('Đã đổi sang Gói Doanh nghiệp', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Gói Doanh nghiệp' })).toBeVisible();
    await expect(page.getByText('Đang hoạt động').first()).toBeVisible();

    // The paid invoice is in the history; "Tải hóa đơn" opens the receipt in a new tab.
    await page.goto(paymentsPath(workspaceId));
    const history = page.getByRole('table', { name: 'Lịch sử giao dịch' });
    const row = history.getByRole('row').filter({ hasText: INVOICE_NUMBER });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Đã thanh toán');
    await expect(row).toContainText('1.490.000 ₫');
    await expect(row).toContainText('Gói Doanh nghiệp');
    const [receipt] = await Promise.all([
      context.waitForEvent('page'),
      row.getByRole('link', { name: /^Tải hóa đơn HD-/ }).click(),
    ]);
    await expect(receipt).toHaveURL(
      new RegExp(`/workspaces/${workspaceId}/billing/receipts/[0-9a-f]{24}$`),
    );
    await expect(
      receipt.getByRole('heading', { level: 1, name: 'Biên nhận thanh toán' }),
    ).toBeVisible();
    await expect(receipt.getByText(INVOICE_NUMBER).first()).toBeVisible();
    await expect(receipt.getByText('1.490.000 ₫').first()).toBeVisible();
    // The billing information as it was when the invoice was made.
    await expect(receipt.getByText('Công ty TNHH Mây Xanh')).toBeVisible();
    await expect(receipt.getByText('0123456789-001')).toBeVisible();
    await expect(
      receipt.getByText('Đây là biên nhận thanh toán, không phải hóa đơn điện tử.'),
    ).toBeVisible();
    await expect(receipt.getByRole('button', { name: 'In hoặc lưu PDF' })).toBeVisible();
    await receipt.close();
  });

  test('a declined card fails the upgrade with its reason; the invoice is paid again with a valid card', async ({
    page,
  }) => {
    const { site } = await setUpSite(page.request);
    const workspaceId = site.workspaceId;
    await changePlanViaApi(page.request, workspaceId, 'basic');
    await addCardViaGateway(page, workspaceId, CARD_DECLINED);

    const { dialog, pay } = await chooseBusinessAndPay(page, workspaceId);
    await pay.click();
    const refused = dialog.getByRole('alert').filter({ hasText: 'Ngân hàng từ chối thẻ' });
    await expect(refused).toBeVisible();
    await expect(refused).toContainText(INVOICE_NUMBER);
    await page.keyboard.press('Escape');
    // The plan is as it was.
    await expect(page.getByRole('heading', { level: 2, name: 'Gói Cơ bản' })).toBeVisible();

    // Board 29: the failed invoice says why and offers "Thanh toán lại".
    await page.goto(paymentsPath(workspaceId));
    const history = page.getByRole('table', { name: 'Lịch sử giao dịch' });
    const row = history.getByRole('row').filter({ hasText: INVOICE_NUMBER });
    await expect(row).toContainText('Thất bại');
    const alert = page.getByRole('alert').filter({ hasText: 'không thành công' });
    await expect(alert).toContainText('Ngân hàng từ chối thẻ');
    await expect(alert.getByRole('button', { name: 'Thanh toán lại' })).toBeVisible();

    // A valid card, then the same invoice is paid.
    await alert.getByRole('button', { name: 'Đổi phương thức' }).click();
    await expect(page).toHaveURL(/\/api\/public\/billing\/fake-gateway\/setup/);
    await page.getByLabel('Số thẻ').fill(CARD_OK);
    await page.getByLabel('Hết hạn (MM/YY)').fill('12/35');
    await page.getByLabel('CVC').fill('123');
    await page.getByRole('button', { name: 'Lưu thẻ' }).click();
    await expect(page.getByText('Đã lưu thẻ', { exact: true })).toBeVisible();
    await row.getByRole('button', { name: /^Thanh toán lại hóa đơn HD-/ }).click();
    await expect(page.getByText('Đã thanh toán 1.490.000 ₫').first()).toBeVisible();
    await expect(row).toContainText('Đã thanh toán');
    await expect(page.getByRole('alert').filter({ hasText: 'không thành công' })).toHaveCount(0);

    await page.goto(`/workspaces/${workspaceId}/billing`);
    await expect(page.getByRole('heading', { level: 2, name: 'Gói Doanh nghiệp' })).toBeVisible();
    await expect(page.getByText('Đang hoạt động').first()).toBeVisible();
  });

  test('an Admin sees plans but payments are the owner only', async ({
    page,
    browser,
    request,
  }) => {
    const { site } = await setUpSite(page.request);
    const adminPage = await joinAs(page.request, browser, request, site.workspaceId, 'admin');
    try {
      await adminPage.goto(paymentsPath(site.workspaceId));
      await expect(
        adminPage.getByRole('heading', { name: 'Chỉ Chủ sở hữu xem được thanh toán' }),
      ).toBeVisible();
      await expect(adminPage.getByRole('link', { name: 'Xem gói & mức dùng' })).toBeVisible();
      await expect(adminPage.getByRole('table', { name: 'Lịch sử giao dịch' })).toHaveCount(0);
      // The API agrees.
      const invoices = await adminPage.request.get(
        `${urls.admin}/api/workspaces/${site.workspaceId}/billing/invoices`,
      );
      expect(invoices.status()).toBe(403);
    } finally {
      await adminPage.context().close();
    }
  });
});
