import { expect, type Page } from '@playwright/test';
import type { Account } from './setup.js';

/** Signs up through the form; a new account goes straight to site creation. */
export async function signUpThroughForm(page: Page, account: Account): Promise<void> {
  await page.goto('/signup');
  await page.getByLabel('Họ và tên').fill(account.name);
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Mật khẩu').fill(account.password);
  await page.getByLabel('Tên workspace').fill(account.workspaceName);
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
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
