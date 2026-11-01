import { expect, test } from '@playwright/test';
import {
  endpoints,
  meResponseSchema,
  RESET_PASSWORD_PATH,
  SIGNUP_VERIFY_PATH,
} from '@plp/contracts';
import { expectAccessible } from '../support/axe.js';
import { fillSignupForm, logInThroughForm } from '../support/flows.js';
import {
  accountLink,
  RESET_EMAIL_SUBJECT,
  SIGNUP_EMAIL_SUBJECT,
  waitForEmail,
} from '../support/mailpit.js';
import { call, newAccount, setUpSite } from '../support/setup.js';
import { urls } from '../urls.js';

const NEW_PASSWORD = 'MatKhau-moi-e2e-2027';

test.describe('E3 · account (ADR-026)', () => {
  test('sign up, check the email, send it again, confirm the newest link', async ({ page }) => {
    const account = newAccount('Ngọc Anh', 'Mây Xanh Agency');
    await fillSignupForm(page, account);
    await expect(page.getByText(account.email)).toBeVisible();
    await expectAccessible(page, 'Đăng ký · Kiểm tra email');

    // Nothing exists before the email is confirmed: the password does not open anything yet.
    const first = await waitForEmail(page.request, account.email, SIGNUP_EMAIL_SUBJECT);
    const login = await page.request.post(`${urls.admin}/api${endpoints.login.path()}`, {
      data: { email: account.email, password: account.password },
      headers: { origin: urls.admin },
    });
    expect(login.status()).toBe(401);

    // "Gửi lại" sends a new link; the first one stops working.
    await page.getByRole('button', { name: 'Gửi lại' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Đã gửi lại email' })).toBeVisible();
    const second = await waitForEmail(page.request, account.email, SIGNUP_EMAIL_SUBJECT, first);

    // Opening the link does nothing by itself, as a mail scanner may open it.
    await page.goto(accountLink(first, SIGNUP_VERIFY_PATH));
    await expect(page.getByRole('heading', { level: 1, name: 'Xác nhận email' })).toBeVisible();
    await expectAccessible(page, 'Xác nhận email');
    await page.getByRole('button', { name: 'Xác nhận và tạo workspace' }).click();
    await expect(page.getByRole('alert')).toContainText('Link xác nhận không còn dùng được');
    await expect(page.getByRole('link', { name: 'Đăng ký lại' })).toBeVisible();

    await page.goto(accountLink(second, SIGNUP_VERIFY_PATH));
    await page.getByRole('button', { name: 'Xác nhận và tạo workspace' }).click();
    await expect(page).toHaveURL(/\/sites\/new$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Tạo site khách hàng' }),
    ).toBeVisible();

    // The link works once.
    await page.goto(accountLink(second, SIGNUP_VERIFY_PATH));
    await page.getByRole('button', { name: 'Xác nhận và tạo workspace' }).click();
    await expect(page.getByRole('alert')).toContainText('Link xác nhận không còn dùng được');
  });

  test('"Đổi email" goes back to the form with what was typed', async ({ page }) => {
    const account = newAccount();
    await fillSignupForm(page, account);
    await page.getByRole('button', { name: 'Đổi email' }).click();
    await expect(page.getByLabel('Email')).toHaveValue(account.email);
    await expect(page.getByLabel('Email')).toBeFocused();
    await expect(page.getByLabel('Tên workspace')).toHaveValue(account.workspaceName);
  });

  test('forgot the password: the link sets a new one and signs every device out', async ({
    page,
    browser,
  }) => {
    // The owner is signed in on another device (the API context of `setUpSite`).
    const other = await browser.newContext();
    try {
      const { account, site } = await setUpSite(other.request);

      await page.goto('/login');
      await page.getByRole('link', { name: 'Quên mật khẩu?' }).click();
      await expect(page).toHaveURL(/\/forgot-password$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Quên mật khẩu' })).toBeVisible();
      await expectAccessible(page, 'Quên mật khẩu');
      await page.getByLabel('Email').fill(account.email);
      await page.getByRole('button', { name: 'Gửi link đặt lại mật khẩu' }).click();
      await expect(page.getByRole('status')).toContainText(
        'Nếu email này có tài khoản, chúng tôi đã gửi link đặt lại mật khẩu',
      );
      await expectAccessible(page, 'Quên mật khẩu · đã gửi');

      const email = await waitForEmail(page.request, account.email, RESET_EMAIL_SUBJECT);
      await page.goto(accountLink(email, RESET_PASSWORD_PATH));
      await expect(page.getByRole('heading', { level: 1, name: 'Đặt mật khẩu mới' })).toBeVisible();
      await expectAccessible(page, 'Đặt mật khẩu mới');
      await page.getByLabel('Mật khẩu mới', { exact: true }).fill(NEW_PASSWORD);
      await page.getByLabel('Nhập lại mật khẩu mới').fill('MatKhau-khac-2027');
      await page.getByRole('button', { name: 'Đặt mật khẩu mới' }).click();
      await expect(page.getByText('Hai mật khẩu chưa khớp')).toBeVisible();
      await page.getByLabel('Nhập lại mật khẩu mới').fill(NEW_PASSWORD);
      await page.getByRole('button', { name: 'Đặt mật khẩu mới' }).click();

      // Signed in at once, in the owner's site.
      await expect(page).toHaveURL(new RegExp(`/sites/${site.id}$`));
      await expect(page.getByRole('heading', { level: 1, name: 'Trang' })).toBeVisible();
      // The other device is signed out.
      const me = await other.request.get(`${urls.admin}/api${endpoints.me.path()}`);
      expect(me.status()).toBe(401);

      // The link works once, and the old password no longer does.
      await page.goto(accountLink(email, RESET_PASSWORD_PATH));
      await page.getByLabel('Mật khẩu mới', { exact: true }).fill('MatKhau-thu-ba-2027');
      await page.getByLabel('Nhập lại mật khẩu mới').fill('MatKhau-thu-ba-2027');
      await page.getByRole('button', { name: 'Đặt mật khẩu mới' }).click();
      await expect(page.getByRole('alert')).toContainText(
        'Link đặt lại mật khẩu không còn dùng được',
      );
      const fresh = await browser.newContext();
      try {
        const signIn = await fresh.newPage();
        await signIn.goto('/login');
        await logInThroughForm(signIn, account);
        await expect(signIn.getByRole('alert')).toContainText('Email hoặc mật khẩu không đúng');
        await logInThroughForm(signIn, { ...account, password: NEW_PASSWORD });
        await expect(signIn).toHaveURL(new RegExp(`/sites/${site.id}$`));
      } finally {
        await fresh.close();
      }
    } finally {
      await other.close();
    }
  });

  test('the account page changes the name and the password, keeping this device signed in', async ({
    page,
    browser,
  }) => {
    const { account, site } = await setUpSite(page.request);
    const phone = await browser.newContext();
    try {
      await call(phone.request, 'POST', endpoints.login.path(), meResponseSchema, {
        email: account.email,
        password: account.password,
      });

      await page.goto(`/sites/${site.id}`);
      await page.getByRole('button', { name: /Chủ sở hữu$/ }).click();
      await page.getByRole('menuitem', { name: 'Cài đặt tài khoản' }).click();
      await expect(page).toHaveURL(/\/account$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Tài khoản' })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue(account.email);
      await expectAccessible(page, 'Tài khoản');

      await page.getByLabel('Tên hiển thị').fill('Ngọc Anh Trần');
      await page.getByRole('button', { name: 'Lưu tên hiển thị' }).click();
      await expect(page.getByText('Đã lưu tên hiển thị')).toBeVisible();

      const passwords = page.getByRole('region', { name: 'Đổi mật khẩu' });
      await passwords.getByLabel('Mật khẩu hiện tại').fill('doan-sai-mat-khau');
      await passwords.getByLabel('Mật khẩu mới', { exact: true }).fill(NEW_PASSWORD);
      await passwords.getByLabel('Nhập lại mật khẩu mới').fill(NEW_PASSWORD);
      await passwords.getByRole('button', { name: 'Đổi mật khẩu' }).click();
      await expect(passwords.getByText('Mật khẩu hiện tại không đúng')).toBeVisible();
      await expectAccessible(page, 'Tài khoản · mật khẩu hiện tại sai');

      await passwords.getByLabel('Mật khẩu hiện tại').fill(account.password);
      await passwords.getByLabel('Mật khẩu mới', { exact: true }).fill(NEW_PASSWORD);
      await passwords.getByLabel('Nhập lại mật khẩu mới').fill(NEW_PASSWORD);
      await passwords.getByRole('button', { name: 'Đổi mật khẩu' }).click();
      await expect(page.getByText('Các thiết bị khác đã được đăng xuất.')).toBeVisible();

      // The other device is signed out; this one stays, with its new name in the sidebar.
      const me = await phone.request.get(`${urls.admin}/api${endpoints.me.path()}`);
      expect(me.status()).toBe(401);
      await page.getByRole('link', { name: 'Quay lại trang quản trị' }).click();
      await expect(page).toHaveURL(new RegExp(`/sites/${site.id}$`));
      await expect(
        page
          .getByRole('navigation', { name: 'Điều hướng chính' })
          .getByRole('button', { name: /Ngọc Anh Trần.*Chủ sở hữu/ }),
      ).toBeVisible();

      // The new password signs in.
      await page.getByRole('button', { name: /Chủ sở hữu$/ }).click();
      await page.getByRole('menuitem', { name: 'Đăng xuất' }).click();
      await expect(page).toHaveURL(/\/login$/);
      await logInThroughForm(page, { ...account, password: NEW_PASSWORD });
      await expect(page).toHaveURL(new RegExp(`/sites/${site.id}$`));
    } finally {
      await phone.close();
    }
  });
});
