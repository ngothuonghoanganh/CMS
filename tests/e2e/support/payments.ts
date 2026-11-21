import { expect, type Page } from '@playwright/test';

/** The fake gateway's test cards (ADR-035). */
export const CARD_OK = '4242 4242 4242 4242';
export const CARD_DECLINED = '4000 0000 0000 0002';

export function paymentsPath(workspaceId: string): string {
  return `/workspaces/${workspaceId}/billing/payments`;
}

/**
 * Adds or replaces the card from board 29 through the fake gateway's own page, as the owner does:
 * the page posts the signed event before it sends the browser back.
 */
export async function addCardViaGateway(
  page: Page,
  workspaceId: string,
  number: string,
): Promise<void> {
  await page.goto(paymentsPath(workspaceId));
  await page.getByRole('button', { name: /^(Thêm phương thức|Đổi thẻ)$/ }).click();
  await expect(page).toHaveURL(/\/api\/public\/billing\/fake-gateway\/setup\?session=/);
  await page.getByLabel('Số thẻ').fill(number);
  await page.getByLabel('Hết hạn (MM/YY)').fill('12/35');
  await page.getByLabel('CVC').fill('123');
  await page.getByRole('button', { name: 'Lưu thẻ' }).click();
  await expect(page.getByText('Đã lưu thẻ', { exact: true })).toBeVisible();
}

export const CARD_INSUFFICIENT_FUNDS = '4000 0000 0000 9995';
