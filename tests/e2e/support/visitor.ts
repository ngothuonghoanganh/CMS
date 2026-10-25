import { type Browser, expect } from '@playwright/test';
import { PRIVACY } from './setup.js';

/** The required consent text of a "Thu lead" page, filled with the business name (ADR-017). */
export const FILLED_CONSENT = `Tôi đồng ý để ${PRIVACY.controllerName} xử lý họ tên và số điện thoại của tôi nhằm liên hệ tư vấn dịch vụ.`;

/**
 * A desktop browser people use: Playwright's own user agent says "HeadlessChrome", which is never
 * counted as a view (ADR-019).
 */
export const VISITOR_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

export interface Visitor {
  name: string;
  phone: string;
  /** Fill the field only bots see. */
  bot?: boolean;
}

/**
 * A visitor without JavaScript sends the form of a "Thu lead" page: the plain POST has no fill
 * time, so a person's lead is never taken for a fast bot, and the result page confirms it.
 */
export async function sendLead(browser: Browser, pageUrl: string, visitor: Visitor): Promise<void> {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(pageUrl);
  const form = page.getByRole('form', { name: 'Đăng ký tư vấn miễn phí' });
  await form.getByRole('textbox', { name: 'Họ và tên' }).fill(visitor.name);
  await form.getByRole('textbox', { name: 'Số điện thoại' }).fill(visitor.phone);
  if (visitor.bot === true) {
    // Hidden from people (off-screen, aria-hidden): only a bot types here.
    await form.locator('input[name="website"]').fill('https://spam.example', { force: true });
  }
  await form.getByRole('checkbox', { name: FILLED_CONSENT }).check();
  await form.getByRole('button', { name: 'Gửi đăng ký' }).click();
  await expect(page.getByRole('heading', { name: 'Đã nhận đăng ký của bạn' })).toBeVisible();
  await context.close();
}
