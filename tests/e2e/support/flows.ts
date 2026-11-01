import { expect, type Page } from '@playwright/test';
import { SIGNUP_VERIFY_PATH } from '@plp/contracts';
import { accountLink, SIGNUP_EMAIL_SUBJECT, waitForEmail } from './mailpit.js';
import type { Account } from './setup.js';

/** Fills and sends the sign-up form at `origin`; the card then says to check the email. */
export async function fillSignupForm(page: Page, account: Account, origin = ''): Promise<void> {
  await page.goto(`${origin}/signup`);
  await page.getByLabel('Họ và tên').fill(account.name);
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Mật khẩu').fill(account.password);
  await page.getByLabel('Tên workspace').fill(account.workspaceName);
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Kiểm tra email' })).toBeVisible();
}

/**
 * Opens the confirmation link Mailpit received for `email` and confirms it (ADR-026): the new
 * workspace opens.
 */
export async function confirmSignupFromEmail(page: Page, email: string): Promise<void> {
  const message = await waitForEmail(page.request, email, SIGNUP_EMAIL_SUBJECT);
  await page.goto(accountLink(message, SIGNUP_VERIFY_PATH));
  await page.getByRole('button', { name: 'Xác nhận và tạo workspace' }).click();
}

/**
 * Signs up through the form and the confirmation email, as a person would; a new account goes
 * straight to site creation.
 */
export async function signUpThroughForm(page: Page, account: Account): Promise<void> {
  await fillSignupForm(page, account);
  await confirmSignupFromEmail(page, account.email);
  await expect(page).toHaveURL(/\/sites\/new$/);
}

/** Creates a site from the "Tạo site" form once the subdomain check passed; returns its id. */
export async function createSiteThroughForm(
  page: Page,
  site: { name: string; subdomain: string },
): Promise<string> {
  await page.getByLabel('Tên site').fill(site.name);
  await page.getByLabel('Tên miền con').fill(site.subdomain);
  await expect(
    page.getByRole('status').filter({ hasText: 'Tên miền con này dùng được.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Tạo site' }).click();
  await expect(page).toHaveURL(/\/sites\/[a-f0-9]{24}$/);
  const siteId = new URL(page.url()).pathname.split('/').at(-1);
  if (siteId === undefined) {
    throw new Error(`No site id in ${page.url()}`);
  }
  return siteId;
}

/** Logs in through the form. */
export async function logInThroughForm(page: Page, account: Account): Promise<void> {
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Mật khẩu').fill(account.password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
}
