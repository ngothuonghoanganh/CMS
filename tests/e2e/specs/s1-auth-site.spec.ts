import { expect, test } from '@playwright/test';
import { createSiteThroughForm, logInThroughForm, signUpThroughForm } from '../support/flows.js';
import { newAccount, newSubdomain, setUpSite, signUpViaApi } from '../support/setup.js';

test.describe('S1 · auth, site and dashboard', () => {
  test('sign up, create a site with a live subdomain check, see the empty dashboard', async ({
    page,
    request,
  }) => {
    // Another agency already uses this subdomain.
    const { site: taken } = await setUpSite(request);
    const account = newAccount();
    await signUpThroughForm(page, account);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Tạo site khách hàng' }),
    ).toBeVisible();

    // The subdomain follows the site name until it is edited.
    await page.getByLabel('Tên site').fill('Nha khoa Smile Care');
    await expect(page.getByLabel('Tên miền con')).toHaveValue('nha-khoa-smile-care');

    // A taken subdomain is reported while typing, and the form does not submit.
    const subdomain = page.getByLabel('Tên miền con');
    await subdomain.fill(taken.subdomain);
    await expect(page.getByText('Tên miền con này đã có người dùng')).toBeVisible();
    await page.getByRole('button', { name: 'Tạo site' }).click();
    await expect(subdomain).toBeFocused();
    await expect(page).toHaveURL(/\/sites\/new$/);

    // A reserved name is refused the same way.
    await subdomain.fill('admin');
    await expect(page.getByText('Tên này được hệ thống giữ lại, hãy chọn tên khác')).toBeVisible();

    const own = newSubdomain();
    const siteId = await createSiteThroughForm(page, {
      name: 'Nha khoa Smile Care',
      subdomain: own,
    });

    await expect(page.getByRole('heading', { level: 1, name: 'Trang' })).toBeVisible();
    await expect(page.getByText('Mây Xanh Agency / Nha khoa Smile Care')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Chưa có trang nào' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Tạo trang đầu tiên' })).toHaveAttribute(
      'href',
      `/sites/${siteId}/pages/new`,
    );
    await expect(page.getByText(`${own}.localhost:3101`).first()).toBeVisible();
    const sidebar = page.getByRole('navigation', { name: 'Điều hướng chính' });
    await expect(sidebar.getByRole('button', { name: /Ngọc Anh.*Owner/ })).toBeVisible();
  });

  test('log out, protected pages ask to log in, log back in', async ({ page }) => {
    const { account, site } = await setUpSite(page.request);
    await page.goto(`/sites/${site.id}`);
    await expect(page.getByRole('heading', { name: 'Chưa có trang nào' })).toBeVisible();

    await page.getByRole('button', { name: /Owner$/ }).click();
    await page.getByRole('menuitem', { name: 'Đăng xuất' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto(`/sites/${site.id}/settings`);
    await expect(page).toHaveURL(/\/login\?next=/);

    await logInThroughForm(page, { ...account, password: 'mat-khau-sai-123' });
    await expect(
      page.getByRole('alert').filter({ hasText: 'Email hoặc mật khẩu không đúng' }),
    ).toBeVisible();

    await logInThroughForm(page, account);
    await expect(page).toHaveURL(new RegExp(`/sites/${site.id}/settings$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Cài đặt site' })).toBeVisible();
  });

  test("another workspace gets the not-found page for the first owner's site", async ({
    page,
    browser,
  }) => {
    const { site } = await setUpSite(page.request);
    const otherContext = await browser.newContext();
    try {
      const other = await otherContext.newPage();
      await signUpViaApi(other.request, newAccount('Người khác', 'Agency khác'));
      for (const path of [`/sites/${site.id}`, `/sites/${site.id}/settings`]) {
        const response = await other.goto(path);
        expect(response?.status()).toBe(404);
        await expect(
          other.getByRole('heading', { level: 1, name: 'Không tìm thấy trang' }),
        ).toBeVisible();
        await expect(other.getByText(site.name)).toHaveCount(0);
      }
    } finally {
      await otherContext.close();
    }
  });
});
