import { expect, type Page, test } from '@playwright/test';
import { endpoints } from '@plp/contracts';
import { setBillingClock } from '../support/billing-clock.js';
import { Editor } from '../support/editor.js';
import { joinAs } from '../support/members.js';
import { fetchPublic } from '../support/public-site.js';
import { createPageViaApi, setUpLeadCaptureViaApi, setUpSite, uniqueId } from '../support/setup.js';
import { sendLead } from '../support/visitor.js';
import { siteOrigin, urls } from '../urls.js';

/*
 * T1 (ADR-035): a new workspace is on a 14-day Agency trial; the owner moves it to Cơ bản and the
 * plan's limits and features show (boards 28, 25, 16, Sidebar v2); once the trial is over the
 * workspace is read-only while the live page and its lead form keep working; billing.view and
 * billing.manage follow the roles.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function sidebar(page: Page) {
  return page.getByRole('navigation', { name: 'Điều hướng chính' });
}

test.describe('T1 · plans, limits and read-only', () => {
  test.afterEach(async ({ request }) => {
    await setBillingClock(request, null);
  });

  test('a new workspace is on a 14-day trial; Cơ bản limits sites, automation and custom roles', async ({
    page,
  }) => {
    const { site } = await setUpSite(page.request);

    // Board 28: the trial of Gói Agency and the usage against its limits.
    await page.goto(`/workspaces/${site.workspaceId}/billing`);
    await expect(page.getByRole('heading', { level: 1, name: 'Gói dịch vụ' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Gói Agency' })).toBeVisible();
    await expect(page.getByText('Dùng thử · còn 14 ngày')).toBeVisible();
    const usage = page.getByRole('list', { name: 'Mức sử dụng' });
    await expect(usage.getByRole('listitem')).toHaveCount(5);
    await expect(usage.getByRole('listitem').filter({ hasText: 'Site' }).first()).toContainText(
      '1 / 5',
    );
    await expect(
      sidebar(page).getByRole('button', { name: /Workspace · Gói Agency/ }),
    ).toBeVisible();

    // Moving to Gói Cơ bản during the trial, as the owner does from "Đổi gói".
    await page.getByRole('button', { name: 'Đổi gói' }).click();
    const dialog = page.getByRole('dialog', { name: 'Đổi gói' });
    await dialog.getByRole('radio', { name: /^Gói Cơ bản/ }).check();
    await dialog.getByRole('button', { name: 'Đổi miễn phí' }).click();
    await expect(page.getByText('Đã đổi sang Gói Cơ bản', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Gói Cơ bản' })).toBeVisible();
    await expect(
      sidebar(page).getByRole('button', { name: /Workspace · Gói Cơ bản/ }),
    ).toBeVisible();
    await expect(usage.getByRole('listitem').filter({ hasText: 'Site' }).first()).toContainText(
      '1 / 1',
    );

    // A second site is the plan's limit, not a permission: "Theo gói" and "Nâng cấp".
    await page.goto('/sites/new');
    await page.getByLabel('Tên site').fill('Site thứ hai');
    await page.getByLabel('Tên miền con').fill(`hai${uniqueId()}`);
    await expect(
      page.getByRole('status').filter({ hasText: 'Tên miền con này dùng được.' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Tạo site' }).click();
    const refused = page.getByRole('alert').filter({ hasText: 'Theo gói' });
    await expect(refused).toBeVisible();
    await expect(refused.getByRole('link', { name: 'Nâng cấp' })).toHaveAttribute(
      'href',
      `/workspaces/${site.workspaceId}/billing`,
    );
    await expect(page).toHaveURL(/\/sites\/new$/);

    // Board 25 without automation, and "Nâng cấp" on the sidebar item.
    await page.goto(`/sites/${site.id}/automations`);
    await expect(page.getByRole('main').getByText('CẦN GÓI CÓ AUTOMATION')).toBeVisible();
    await expect(page.getByRole('main').getByText('không phải quyền của bạn')).toBeVisible();
    await expect(
      sidebar(page)
        .getByRole('link', { name: /^Automation/ })
        .getByText('Nâng cấp'),
    ).toBeVisible();

    // Board 16: custom roles are the plan's, not a permission.
    await page.goto(`/workspaces/${site.workspaceId}/roles`);
    await expect(page.getByRole('button', { name: 'Vai trò tùy chỉnh' })).toBeDisabled();
    await expect(page.getByText('Theo gói', { exact: false }).first()).toBeVisible();
  });

  test('once the trial is over the workspace is read-only; the live page and its form keep working', async ({
    page,
    browser,
    request,
  }) => {
    test.setTimeout(180_000);
    const { site } = await setUpSite(page.request);
    await setUpLeadCaptureViaApi(page.request, site.id);
    const slug = `uu-dai-${uniqueId()}`;
    const created = await createPageViaApi(page.request, site.id, {
      title: 'Ưu đãi niềng răng',
      slug,
      start: {
        kind: 'goal',
        goal: 'lead',
        brief: { offer: 'Niềng răng trong suốt', audience: '', phone: '0901 234 567' },
        style: 'calm',
      },
    });
    const editor = new Editor(page);
    await editor.goto(site.id, created.page.id);
    await editor.publish(1, 'Bản đầu');
    // A draft change waiting to go live.
    await editor.setHeroHeading('Ưu đãi niềng răng tháng 12');

    // Trial over: 15 days later.
    await setBillingClock(request, new Date(Date.now() + 15 * DAY_MS));

    // The editor still opens; publishing is refused with the plan's message, and the draft stays.
    await editor.goto(site.id, created.page.id);
    const dialog = await editor.openPublishDialog();
    const ignore = dialog.getByRole('button', { name: 'Bỏ qua lần này' });
    while ((await ignore.count()) > 0) {
      await ignore.first().click();
    }
    await dialog.getByRole('button', { name: 'Xuất bản v2', exact: true }).click();
    await expect(dialog.getByText(/Thời gian dùng thử đã hết\./).first()).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Xem gói & thanh toán' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'v2 đã live' })).toHaveCount(0);
    await page.keyboard.press('Escape');

    // The editor says so under its top bar, and a change is refused with the way to board 28,
    // not "Thử lại", which could never work.
    const strip = page.getByRole('status').filter({ hasText: 'Workspace đang ở chế độ chỉ đọc' });
    await expect(strip).toContainText('Thay đổi ở đây chưa lưu được.');
    await editor.heroRow.click();
    await editor.heroHeadingField.fill('Ưu đãi niềng răng tháng 1');
    await editor.heroHeadingField.blur();
    await expect(editor.topBar.getByText(/Chưa lưu được/)).toBeVisible();
    await expect(editor.topBar.getByRole('link', { name: 'Xem gói & thanh toán' })).toBeVisible();
    await expect(editor.topBar.getByRole('button', { name: 'Thử lại' })).toHaveCount(0);

    // The workspace screens carry the read-only banner, with the way to pick a plan. The refused
    // change is left behind: the browser asks before leaving it.
    page.once('dialog', (leave) => {
      void leave.accept();
    });
    await page.goto(`/sites/${site.id}`);
    const banner = page.getByRole('status').filter({ hasText: 'Workspace đang ở chế độ chỉ đọc' });
    await expect(banner).toContainText('Trang live và form vẫn chạy.');
    await expect(banner.getByRole('link', { name: 'Xem gói & thanh toán' })).toBeVisible();
    await page.goto(`/workspaces/${site.workspaceId}/billing`);
    await expect(page.getByText('Hết dùng thử').first()).toBeVisible();
    // Board 28 says it once, in its own banner.
    await expect(
      page.getByRole('main').getByText('Trang live và form vẫn chạy.', { exact: false }),
    ).toHaveCount(1);

    // The live page still opens, with the version published before, and takes a lead.
    const pageUrl = `${siteOrigin(site.subdomain)}/${slug}`;
    const live = await fetchPublic(request, site.subdomain, `/${slug}`);
    expect(live.status).toBe(200);
    await sendLead(browser, pageUrl, { name: 'Phạm Mỹ Duyên', phone: '0977 645 010' });
    await expect(async () => {
      await page.goto(`/sites/${site.id}/leads`);
      await expect(page.getByText('Phạm Mỹ Duyên').first()).toBeVisible();
    }).toPass({ timeout: 15_000 });

    // Real time again: the same workspace is not read-only (the trial has 14 days).
    await setBillingClock(request, null);
    await page.goto(`/sites/${site.id}`);
    await expect(page.getByText('Workspace đang ở chế độ chỉ đọc')).toHaveCount(0);
  });

  test('an Admin sees usage but cannot change the plan; a role without billing.view has no way in', async ({
    page,
    browser,
    request,
  }) => {
    const { site } = await setUpSite(page.request);
    const adminPage = await joinAs(page.request, browser, request, site.workspaceId, 'admin');
    const supportPage = await joinAs(page.request, browser, request, site.workspaceId, 'support', [
      site.id,
    ]);
    try {
      await adminPage.goto(`/sites/${site.id}`);
      await sidebar(adminPage).getByRole('link', { name: 'Gói & thanh toán' }).click();
      await expect(adminPage).toHaveURL(new RegExp(`/workspaces/${site.workspaceId}/billing$`));
      await expect(adminPage.getByRole('list', { name: 'Mức sử dụng' })).toBeVisible();
      await expect(adminPage.getByRole('button', { name: 'Đổi gói' })).toHaveCount(0);
      await expect(adminPage.getByText('Chủ sở hữu workspace đổi được gói.')).toBeVisible();
      // The API agrees: billing.manage is the owner's alone.
      const denied = await adminPage.request.post(
        `${urls.admin}/api${endpoints.changePlan.path(site.workspaceId)}`,
        { data: { planId: 'basic', cycle: 'monthly' }, headers: { origin: urls.admin } },
      );
      expect(denied.status()).toBe(403);

      await supportPage.goto(`/sites/${site.id}`);
      await expect(
        sidebar(supportPage).getByRole('link', { name: 'Gói & thanh toán' }),
      ).toHaveCount(0);
      await supportPage.goto(`/workspaces/${site.workspaceId}/billing`);
      await expect(
        supportPage.getByRole('heading', { name: 'Bạn chưa có quyền xem gói và thanh toán' }),
      ).toBeVisible();
      await expect(supportPage.getByRole('list', { name: 'Mức sử dụng' })).toHaveCount(0);
      const summary = await supportPage.request.get(
        `${urls.admin}/api${endpoints.getBillingSummary.path(site.workspaceId)}`,
      );
      expect(summary.status()).toBe(403);
    } finally {
      await adminPage.context().close();
      await supportPage.context().close();
    }
  });
});
