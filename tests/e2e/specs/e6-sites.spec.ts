import { expect, test } from '@playwright/test';
import { expectAccessible, expectNoSidewaysScroll, SCAN_VIEWPORTS } from '../support/axe.js';
import { publishViaApi, sendLeadViaRenderer } from '../support/board.js';
import {
  createPageViaApi,
  createSiteViaApi,
  newAccount,
  newSubdomain,
  setUpLeadCaptureViaApi,
  setUpSite,
  signUpViaApi,
  uniqueId,
} from '../support/setup.js';

/*
 * E6 (ADR-028): "Sites" leads the sidebar's WORKSPACE group and lists the workspace's sites with
 * their counts; a row opens the site's pages. The counts per role and per member's sites are the
 * API's integration tests.
 */
test.describe('E6 · Sites screen', () => {
  test('opens Sites from the sidebar, sees two sites with their counts, opens one', async ({
    page,
  }) => {
    const { site } = await setUpSite(page.request);
    const spa = await createSiteViaApi(page.request, site.workspaceId, {
      name: 'Spa Lá Xanh',
      subdomain: newSubdomain(),
    });
    // Nha khoa Smile Care: a live page with a lead, and a draft. Spa Lá Xanh: nothing yet.
    await setUpLeadCaptureViaApi(page.request, site.id);
    const slug = `dang-ky-${uniqueId()}`;
    const live = await createPageViaApi(page.request, site.id, {
      title: 'Đăng ký tư vấn',
      slug,
      start: {
        kind: 'goal',
        goal: 'lead',
        brief: { offer: 'Niềng răng trong suốt', audience: '', phone: '0901 234 567' },
        style: 'calm',
      },
    });
    const { release } = await publishViaApi(page.request, live.page, 'Bản đầu tiên');
    await sendLeadViaRenderer(page.request, site.subdomain, release.id, {
      name: 'Nguyễn Thu Hà',
      phone: '0901 234 567',
      slug,
      source: { utmSource: null, utmMedium: null, referrer: null },
      phoneDevice: true,
      status: 'new',
    });
    await createPageViaApi(page.request, site.id, {
      title: 'Ưu đãi tháng 12',
      slug: `uu-dai-${uniqueId()}`,
      start: { kind: 'blank' },
    });

    await page.goto(`/sites/${site.id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Trang' })).toBeVisible();
    const sidebar = page.getByRole('navigation', { name: 'Điều hướng chính' });
    const sitesLink = sidebar.getByRole('link', { name: 'Sites 2 site', exact: true });
    await sitesLink.click();

    await expect(page).toHaveURL(new RegExp(`/workspaces/${site.workspaceId}/sites$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Sites' })).toBeVisible();
    await expect(sitesLink).toHaveAttribute('aria-current', 'page');
    // The owner alone so far.
    await expect(
      sidebar.getByRole('link', { name: 'Thành viên 1 thành viên', exact: true }),
    ).toBeVisible();

    const list = page.getByRole('table');
    const smileRow = list.getByRole('row', { name: new RegExp(site.name) });
    await expect(smileRow.getByRole('cell')).toHaveText([
      new RegExp(site.name),
      '2',
      '1',
      '1',
      /^Mở/,
    ]);
    await expect(
      list.getByRole('row', { name: new RegExp(spa.name) }).getByRole('cell'),
    ).toHaveText([new RegExp(spa.name), '0', '0', '0', /^Mở/]);

    await smileRow.getByRole('link', { name: site.name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/sites/${site.id}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Trang' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Đăng ký tư vấn', exact: true })).toBeVisible();

    // The workspace itself opens on Sites, e.g. after signing in again from one of its screens.
    await page.goto(`/workspaces/${site.workspaceId}`);
    await expect(page).toHaveURL(new RegExp(`/workspaces/${site.workspaceId}/sites$`));
  });

  test('a workspace without a site starts its first one from Sites', async ({ page }) => {
    const me = await signUpViaApi(page.request, newAccount());
    const workspace = me.memberships[0]?.workspace;
    if (workspace === undefined) {
      throw new Error('Sign-up returned no workspace');
    }
    await page.goto(`/workspaces/${workspace.id}/sites`);
    await expect(page.getByRole('heading', { level: 3, name: 'Chưa có site nào' })).toBeVisible();
    await page.getByRole('link', { name: 'Tạo site đầu tiên', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/sites/new\\?workspace=${workspace.id}$`));
    await expect(
      page.getByRole('heading', { level: 1, name: 'Tạo site khách hàng' }),
    ).toBeVisible();
  });

  for (const viewport of SCAN_VIEWPORTS) {
    test(`Sites is accessible at ${viewport.width} px`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const { site } = await setUpSite(page.request);
      await createSiteViaApi(page.request, site.workspaceId, {
        name: 'Spa Lá Xanh',
        subdomain: newSubdomain(),
      });
      await page.goto(`/workspaces/${site.workspaceId}/sites`);
      await expect(page.getByRole('heading', { level: 1, name: 'Sites' })).toBeVisible();
      await expectAccessible(page, 'Sites');
      await expectNoSidewaysScroll(page, 'Sites');
    });
  }

  test('the Sites of someone else is not found', async ({ page, browser }) => {
    const { site } = await setUpSite(page.request);
    const other = await browser.newContext();
    try {
      await setUpSite(other.request);
      const otherPage = await other.newPage();
      await otherPage.goto(`/workspaces/${site.workspaceId}/sites`);
      await expect(otherPage.getByRole('heading', { level: 1 })).toHaveText('Không tìm thấy trang');
    } finally {
      await other.close();
    }
  });
});
