import { expect, type Page, test } from '@playwright/test';
import { Editor } from '../support/editor.js';
import {
  openBuyDialog,
  priceBoxOf,
  tickAndPay,
  TERMS_LABEL,
} from '../support/marketplace-purchase.js';
import { waitForEmail } from '../support/mailpit.js';
import { CARD_DECLINED, CARD_OK, paymentsPath, saveCardAtGateway } from '../support/payments.js';
import { fetchPublic, firstHeading } from '../support/public-site.js';
import {
  createSiteViaApi,
  newSubdomain,
  setUpLeadCaptureViaApi,
  setUpSite,
  uniqueId,
} from '../support/setup.js';

/*
 * The end of the Marketplace phase (docs/ARCHITECTURE.md §5, "Hoàn thành Marketplace"): one
 * journey from sign-up to a live page made from a bought item, with the fake gateway.
 */

const FREE = { id: 'mp-khoa-hoc-tieng-anh-tre-em', name: 'Khóa học tiếng Anh trẻ em' };
const PAID = { id: 'mp-mo-ban-du-an-can-ho', name: 'Mở bán dự án căn hộ' };

async function createPageFromLibrary(
  page: Page,
  workspace: string,
  siteId: string,
  itemName: string,
  name: string,
  slug: string,
): Promise<void> {
  await page.goto(`${workspace}/templates?source=marketplace&site=${siteId}`);
  await page.getByRole('button', { name: `Dùng mẫu ${itemName}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Tạo trang từ mẫu' });
  await expect(dialog.getByRole('combobox', { name: 'Site' })).toHaveValue(siteId);
  await dialog.getByRole('textbox', { name: /Tên trang/ }).fill(name);
  await dialog.getByRole('textbox', { name: /Đường dẫn/ }).fill(slug);
  await expect(dialog.getByText('Đường dẫn này dùng được.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Tạo bản nháp và mở editor' }).click();
  await expect(page).toHaveURL(new RegExp(`/sites/${siteId}/pages/[a-f0-9]{24}/edit$`));
}

test('Marketplace: free claim, declined card, valid card, receipt, licence in two sites', async ({
  page,
  request,
  context,
}) => {
  test.setTimeout(420_000);
  const { account, site } = await setUpSite(page.request);
  await setUpLeadCaptureViaApi(page.request, site.id);
  const workspaceId = site.workspaceId;
  const workspace = `/workspaces/${workspaceId}`;

  await test.step('1. sign-up, the Marketplace, "Chỉ miễn phí", claim the free item', async () => {
    await page.goto(`/sites/${site.id}`);
    const sidebar = page.getByRole('navigation', { name: 'Điều hướng chính' });
    await sidebar.getByRole('link', { name: 'Marketplace', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${workspace}/marketplace$`));
    await page.getByRole('combobox', { name: 'Giá' }).selectOption('free');
    const cards = page.getByRole('article');
    await expect(cards.getByRole('heading', { level: 2 })).toHaveText([FREE.name]);
    await cards.getByRole('link', { name: FREE.name }).click();
    await expect(page).toHaveURL(new RegExp(`${workspace}/marketplace/${FREE.id}$`));
    await priceBoxOf(page).getByRole('button', { name: 'Nhận mẫu' }).click();
    const claim = page.getByRole('dialog', { name: 'Nhận mẫu' });
    await claim.getByRole('checkbox', { name: TERMS_LABEL }).check();
    await claim.getByRole('button', { name: 'Nhận mẫu' }).click();
    await expect(claim).toBeHidden();
    await expect(priceBoxOf(page).getByText('Workspace đã sở hữu · v1')).toBeVisible();

    await page.goto(`${workspace}/marketplace/owned`);
    const rows = page.getByRole('region', { name: 'Template đã sở hữu' }).getByRole('listitem');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(FREE.name);
    await expect(rows.first()).toContainText('Miễn phí');
    await expect(rows.first()).toContainText('Mọi site trong workspace');
  });

  await test.step('2. a paid item: the dialog, a declined card, nothing owned', async () => {
    let dialog = await openBuyDialog(page, workspace, PAID.id);
    // No card yet: the dialog asks for one, still with the price, VAT and unticked terms.
    await expect(dialog).toContainText('499.000');
    await expect(dialog).toContainText('Đã gồm VAT');
    await expect(dialog.getByRole('checkbox', { name: TERMS_LABEL })).not.toBeChecked();
    await dialog.getByRole('button', { name: 'Thêm thẻ' }).click();
    await saveCardAtGateway(page, CARD_DECLINED);
    await expect(page).toHaveURL(new RegExp(`${workspace}/marketplace/${PAID.id}`));
    dialog = page.getByRole('dialog');
    await tickAndPay(dialog);
    await expect(
      dialog.getByRole('alert').filter({ hasText: 'Ngân hàng từ chối thẻ' }),
    ).toBeVisible();

    await dialog.getByRole('button', { name: 'Đóng' }).first().click();
    await expect(priceBoxOf(page).getByText(/Workspace đã sở hữu/)).toHaveCount(0);
  });

  await test.step('3. "Đổi phương thức", a valid card, "Đã mua", board 29 and the receipt', async () => {
    let dialog = await openBuyDialog(page, workspace, PAID.id);
    await dialog.getByRole('button', { name: 'Đổi' }).click();
    await saveCardAtGateway(page, CARD_OK);
    await expect(page).toHaveURL(new RegExp(`${workspace}/marketplace/${PAID.id}`));
    dialog = page.getByRole('dialog');
    await tickAndPay(dialog);
    await expect(dialog.getByText(`Đã mua “${PAID.name}”`).first()).toBeVisible();
    await dialog.getByRole('button', { name: 'Đóng' }).first().click();

    await page.goto(paymentsPath(workspaceId));
    const history = page.getByRole('table', { name: 'Lịch sử giao dịch' });
    const row = history
      .getByRole('row')
      .filter({ hasText: `Mẫu “${PAID.name}” · Marketplace` })
      .filter({ hasText: 'Đã thanh toán' });
    await expect(row).toHaveCount(1);
    const [receipt] = await Promise.all([
      context.waitForEvent('page'),
      row.getByRole('link', { name: /^Tải hóa đơn HD-/ }).click(),
    ]);
    await expect(
      receipt.getByRole('heading', { level: 1, name: 'Biên nhận thanh toán' }),
    ).toBeVisible();
    await expect(receipt.getByText(PAID.name).first()).toBeVisible();
    await receipt.close();

    const email = await waitForEmail(request, account.email, `Mẫu “${PAID.name}”`);
    expect(email.Subject).toContain('Biên nhận HD-');
  });

  await test.step('4. board 31 says the workspace owns it; the library tab has both', async () => {
    await page.goto(`${workspace}/marketplace/${PAID.id}`);
    await expect(priceBoxOf(page).getByText('Workspace đã sở hữu · v1')).toBeVisible();
    await page.goto(`${workspace}/templates?site=${site.id}`);
    await page
      .getByRole('navigation', { name: 'Nguồn mẫu' })
      .getByRole('link', { name: 'Đã sở hữu từ Marketplace · 2' })
      .click();
    const owned = page.getByRole('article');
    await expect(owned).toHaveCount(2);
    await expect(owned.filter({ hasText: FREE.name })).toHaveCount(1);
    await expect(owned.filter({ hasText: PAID.name })).toHaveCount(1);
  });

  await test.step('5. a page from the bought item in site 1, edited and published', async () => {
    const slug = `mau-${uniqueId()}`;
    await createPageFromLibrary(page, workspace, site.id, PAID.name, 'Căn hộ tháng 12', slug);
    const editor = new Editor(page);
    await expect(editor.canvas).toBeVisible();
    const heading = `Mở bán căn hộ giai đoạn 1 ${uniqueId()}`;
    await editor.setHeroHeading(heading);
    await editor.publish(1);
    const live = await fetchPublic(request, site.subdomain, `/${slug}`);
    expect(live.status).toBe(200);
    expect(firstHeading(live.html)).toBe(heading);
  });

  await test.step('6. a second site makes a page from the same item without buying again', async () => {
    const second = await createSiteViaApi(page.request, workspaceId, {
      name: 'Căn hộ Hoa Sen',
      subdomain: newSubdomain(),
    });
    await createPageFromLibrary(
      page,
      workspace,
      second.id,
      PAID.name,
      'Căn hộ Hoa Sen',
      `mau-${uniqueId()}`,
    );
    await expect(new Editor(page).canvas).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Căn hộ Hoa Sen' })).toBeVisible();
  });
});
