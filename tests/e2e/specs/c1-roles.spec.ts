import { expect, test } from '@playwright/test';
import { expectAccessible, expectNoSidewaysScroll, SCAN_VIEWPORTS } from '../support/axe.js';
import { createSiteViaApi, newSubdomain, setUpSite } from '../support/setup.js';

/*
 * C1 (ADR-020): the workspace's "Vai trò & quyền" from the sidebar, with the site the user worked
 * on kept beside it. Which role may call which endpoint is the API's integration matrix; the
 * other roles reach the admin with invitations (C2).
 */
test.describe('C1 · roles and permissions', () => {
  test('the owner opens "Vai trò & quyền" from the sidebar and compares the roles', async ({
    page,
  }) => {
    const { site } = await setUpSite(page.request);
    const spa = await createSiteViaApi(page.request, site.workspaceId, {
      name: 'Spa Lá Xanh',
      subdomain: newSubdomain(),
    });

    // The sidebar of the second site keeps it once the user moves to the workspace screen.
    await page.goto(`/sites/${spa.id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Trang' })).toBeVisible();
    const sidebar = page.getByRole('navigation', { name: 'Điều hướng chính' });
    await sidebar.getByRole('link', { name: 'Vai trò & quyền' }).click();

    await expect(page).toHaveURL(new RegExp(`/workspaces/${site.workspaceId}/roles$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Vai trò & quyền' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Vai trò & quyền' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(sidebar.getByRole('button', { name: /Spa Lá Xanh/ })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /^Trang/ })).toHaveAttribute(
      'href',
      `/sites/${spa.id}`,
    );

    const roles = page.getByRole('navigation', { name: 'Danh sách vai trò' });
    await expect(roles.getByRole('button', { name: /^Chủ sở hữu.*1 thành viên$/ })).toBeVisible();
    await expect(roles.getByRole('button', { name: /^Quản trị.*0 thành viên$/ })).toBeVisible();

    const matrix = page.getByRole('table', { name: 'Ma trận quyền theo vai trò' });
    const exportRow = matrix.getByRole('row', { name: /Xuất lead ra CSV/ });
    await expect(exportRow.getByRole('cell')).toHaveText([
      'Được phép',
      'Được phép',
      /Không/,
      /Không/,
      /Không/,
      /Không/,
    ]);

    // Choosing a role by keyboard brings its column forward.
    const support = roles.getByRole('button', { name: /^Chăm sóc khách hàng/ });
    await support.focus();
    await page.keyboard.press('Enter');
    await expect(support).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Đang làm nổi Chăm sóc khách hàng')).toBeVisible();
  });

  for (const viewport of SCAN_VIEWPORTS) {
    test(`"Vai trò & quyền" is accessible at ${viewport.width} px`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const { site } = await setUpSite(page.request);
      await page.goto(`/workspaces/${site.workspaceId}/roles`);
      await expect(page.getByRole('heading', { level: 1, name: 'Vai trò & quyền' })).toBeVisible();
      await expectAccessible(page, 'Vai trò & quyền');
      await expectNoSidewaysScroll(page, 'Vai trò & quyền');
    });
  }

  test('a workspace of someone else is not found', async ({ page, browser }) => {
    const { site } = await setUpSite(page.request);
    const other = await browser.newContext();
    try {
      await setUpSite(other.request);
      const otherPage = await other.newPage();
      await otherPage.goto(`/workspaces/${site.workspaceId}/roles`);
      await expect(otherPage.getByRole('heading', { level: 1 })).toHaveText('Không tìm thấy trang');
    } finally {
      await other.close();
    }
  });
});
