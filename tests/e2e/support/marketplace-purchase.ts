import { expect, type Locator, type Page } from '@playwright/test';

/** Paid items of the bundled catalog (ADR-036) with the price board 31 shows for each. */
export const GYM = { id: 'mp-khai-truong-phong-tap', name: 'Khai trương phòng tập' };
export const APARTMENT = { id: 'mp-mo-ban-du-an-can-ho', name: 'Mở bán dự án căn hộ' };

export const TERMS_LABEL = 'Tôi đồng ý với điều khoản giấy phép';

export function priceBoxOf(page: Page): Locator {
  return page.getByRole('complementary', { name: 'Giá' });
}

/** Board 31's "Mua mẫu": opens the dialog and waits for its quote. */
export async function openBuyDialog(page: Page, workspace: string, itemId: string) {
  await page.goto(`${workspace}/marketplace/${itemId}`);
  await priceBoxOf(page).getByRole('button', { name: 'Mua mẫu' }).click();
  // The dialog's title follows its state ("Đang thanh toán…", "Đã mua …"), so it is found by role alone.
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('checkbox', { name: TERMS_LABEL })).toBeVisible();
  return dialog;
}

/** Ticks the terms and presses "Thanh toán …" of an open dialog. */
export async function tickAndPay(dialog: Locator): Promise<void> {
  await dialog.getByRole('checkbox', { name: TERMS_LABEL }).check();
  const pay = dialog.getByRole('button', { name: /^Thanh toán \d/ });
  await expect(pay).toBeEnabled();
  await pay.click();
}
