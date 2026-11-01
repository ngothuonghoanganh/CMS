import { expect, type Page, test } from '@playwright/test';
import { expectAccessible, expectNoSidewaysScroll, SCAN_VIEWPORTS } from '../support/axe.js';
import { type MailpitMessage, waitForEmail } from '../support/mailpit.js';
import { setUpSite, uniqueId } from '../support/setup.js';

/*
 * C2 (ADR-021): Chủ sở hữu invites by email, the invited person signs up from the link into the
 * workspace with the role and sites given, asks for another role, and Chủ sở hữu accepts it from
 * the email; then the ownership changes hands.
 */

function link(message: MailpitMessage, pattern: RegExp): string {
  const found = pattern.exec(message.Text)?.[0];
  if (found === undefined) {
    throw new Error(`No link in "${message.Subject}"`);
  }
  return found;
}

const INVITATION_LINK = /http:\/\/localhost:3100\/invite#token=[A-Za-z0-9_-]{43}/;
const REVIEW_LINK =
  /http:\/\/localhost:3100\/workspaces\/[a-f0-9]{24}\/members\?request=[a-f0-9]{24}/;

function sidebar(page: Page) {
  return page.getByRole('navigation', { name: 'Điều hướng chính' });
}

test.describe('C2 · members and invitations', () => {
  test('invite, sign up from the link, ask for another role, accept it, hand the workspace over', async ({
    page,
    browser,
    request,
  }) => {
    const { account, site } = await setUpSite(page.request);
    const invited = `moi-${uniqueId()}@example.com`;

    // Chủ sở hữu invites a Chăm sóc khách hàng for the site.
    await page.goto(`/sites/${site.id}`);
    await sidebar(page).getByRole('link', { name: 'Thành viên' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Thành viên' })).toBeVisible();
    await page.getByRole('button', { name: 'Mời thành viên' }).click();
    const invite = page.getByRole('dialog', { name: 'Mời thành viên' });
    await invite.getByLabel('Email').fill(invited);
    await invite.getByRole('radio', { name: /Chăm sóc khách hàng/ }).check();
    await invite.getByRole('radio', { name: /Chỉ các site được chọn/ }).check();
    await invite.getByRole('checkbox', { name: site.name }).check();
    await invite.getByRole('button', { name: 'Gửi 1 lời mời' }).click();
    await expect(page.getByText('Đã gửi 1 lời mời', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Lời mời đang chờ · 1/ }).click();
    await expect(page.getByRole('row', { name: new RegExp(invited) })).toContainText(
      'Hết hạn sau 7 ngày',
    );

    // The invited person signs up from the email, straight into the workspace.
    const email = await waitForEmail(request, invited, 'mời bạn vào Mây Xanh Agency');
    const member = await browser.newContext();
    try {
      const memberPage = await member.newPage();
      await memberPage.goto(link(email, INVITATION_LINK));
      await expect(
        memberPage.getByRole('heading', { level: 1, name: 'Tạo tài khoản để tham gia' }),
      ).toBeVisible();
      await expect(memberPage.getByLabel('Email')).toHaveValue(invited);
      await memberPage.getByLabel('Họ và tên').fill('Thu Hà');
      await memberPage.getByLabel('Mật khẩu').fill('MatKhau-e2e-an-toan-2026');
      await memberPage.getByRole('button', { name: 'Tạo tài khoản và tham gia' }).click();
      await expect(memberPage).toHaveURL(new RegExp(`/sites/${site.id}$`));
      const memberNav = sidebar(memberPage);
      await expect(memberNav.getByRole('button', { name: /Thu Hà/ })).toContainText(
        'Chăm sóc khách hàng · 1 site',
      );
      await expect(memberNav.getByRole('link', { name: /^Leads/ })).toBeVisible();
      await expect(memberNav.getByRole('link', { name: 'Cài đặt site' })).toHaveCount(0);
      await expect(memberNav.getByRole('link', { name: 'Thành viên' })).toHaveCount(0);

      // They ask Chủ sở hữu to edit pages.
      await memberNav.getByRole('button', { name: /Thu Hà/ }).click();
      await memberPage.getByRole('menuitem', { name: 'Yêu cầu đổi quyền' }).click();
      const ask = memberPage.getByRole('dialog', { name: 'Yêu cầu đổi quyền' });
      await ask.getByRole('radio', { name: /Biên tập/ }).check();
      await ask.getByLabel('Lời nhắn cho Chủ sở hữu').fill('Cần sửa trang ưu đãi');
      await ask.getByRole('button', { name: 'Gửi yêu cầu' }).click();
      await expect(
        memberPage.getByText('Đã gửi yêu cầu tới Chủ sở hữu', { exact: true }),
      ).toBeVisible();

      // Chủ sở hữu opens the request from the email and accepts it.
      const ownerEmail = await waitForEmail(request, account.email, 'Thu Hà xin đổi quyền');
      await page.goto(link(ownerEmail, REVIEW_LINK));
      const decide = page.getByRole('dialog', { name: 'Quyền của Thu Hà' });
      await expect(decide).toContainText('Thu Hà đang là Chăm sóc khách hàng và xin làm Biên tập');
      await expect(decide.getByLabel('Vai trò')).toHaveValue('editor');
      await decide.getByRole('button', { name: 'Chấp nhận và lưu quyền' }).click();
      await expect(page.getByText('Đã lưu quyền của Thu Hà', { exact: true })).toBeVisible();
      await waitForEmail(request, invited, 'đã được chấp nhận');

      // The next request follows the new role.
      await memberPage.reload();
      await expect(memberNav.getByRole('link', { name: 'Cài đặt site' })).toBeVisible();
      await expect(memberNav.getByRole('link', { name: /^Leads/ })).toHaveCount(0);

      // Chủ sở hữu makes them Quản trị, then hands the workspace over.
      await expect(page.getByText('Không có yêu cầu nào chờ duyệt')).toBeVisible();
      await page.getByRole('button', { name: /Đang hoạt động · 2/ }).click();
      await page.getByRole('button', { name: 'Đổi quyền của Thu Hà' }).click();
      const change = page.getByRole('dialog', { name: 'Quyền của Thu Hà' });
      await change.getByLabel('Vai trò').selectOption('admin');
      await change.getByRole('button', { name: 'Lưu quyền' }).click();
      await expect(page.getByRole('row', { name: /Thu Hà/ })).toContainText('Quản trị');
      await page.getByRole('button', { name: 'Chuyển quyền sở hữu' }).click();
      const transfer = page.getByRole('dialog', { name: 'Chuyển quyền sở hữu workspace' });
      await transfer.getByLabel('Nhập tên workspace để xác nhận').fill('Mây Xanh Agency');
      await transfer.getByRole('button', { name: 'Chuyển quyền sở hữu' }).click();
      await expect(page.getByText('Đã chuyển quyền sở hữu', { exact: true })).toBeVisible();
      await expect(page.getByRole('row', { name: /Thu Hà/ })).toContainText('Chủ sở hữu');
      await expect(page.getByRole('row', { name: /\(bạn\)/ })).toContainText('Quản trị');
    } finally {
      await member.close();
    }
  });

  test('revoke an invitation: its link stops working', async ({ page, request, browser }) => {
    const { site } = await setUpSite(page.request);
    const invited = `thu-hoi-${uniqueId()}@example.com`;
    await page.goto(`/sites/${site.id}`);
    await sidebar(page).getByRole('link', { name: 'Thành viên' }).click();
    await page.getByRole('button', { name: 'Mời thành viên' }).click();
    const invite = page.getByRole('dialog', { name: 'Mời thành viên' });
    await invite.getByLabel('Email').fill(invited);
    await invite.getByRole('radio', { name: /Toàn workspace/ }).check();
    await invite.getByRole('button', { name: 'Gửi 1 lời mời' }).click();
    await page.getByRole('button', { name: /Lời mời đang chờ · 1/ }).click();
    await page.getByRole('button', { name: `Thu hồi lời mời tới ${invited}` }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Thu hồi' }).click();
    await expect(page.getByText('Không có lời mời nào đang chờ')).toBeVisible();

    const email = await waitForEmail(request, invited, 'mời bạn vào');
    const other = await browser.newContext();
    try {
      const otherPage = await other.newPage();
      await otherPage.goto(link(email, INVITATION_LINK));
      await expect(
        otherPage.getByRole('heading', { level: 1, name: 'Lời mời không còn hiệu lực' }),
      ).toBeVisible();
    } finally {
      await other.close();
    }
  });

  for (const viewport of SCAN_VIEWPORTS) {
    test(`"Thành viên" and the invitation page are accessible at ${viewport.width} px`, async ({
      page,
      request,
      browser,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const { site } = await setUpSite(page.request);
      const invited = `a11y-${uniqueId()}@example.com`;
      await page.goto(`/workspaces/${site.workspaceId}/members`);
      await expect(page.getByRole('heading', { level: 1, name: 'Thành viên' })).toBeVisible();
      await expectAccessible(page, 'Thành viên');
      await expectNoSidewaysScroll(page, 'Thành viên');
      await page.getByRole('button', { name: 'Mời thành viên' }).click();
      const invite = page.getByRole('dialog', { name: 'Mời thành viên' });
      await expectAccessible(page, 'Mời thành viên');
      await invite.getByLabel('Email').fill(invited);
      await invite.getByRole('radio', { name: /Toàn workspace/ }).check();
      await invite.getByRole('button', { name: 'Gửi 1 lời mời' }).click();
      await expect(page.getByText('Đã gửi 1 lời mời', { exact: true })).toBeVisible();

      const email = await waitForEmail(request, invited, 'mời bạn vào');
      const other = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      });
      try {
        const otherPage = await other.newPage();
        await otherPage.goto(link(email, INVITATION_LINK));
        await expect(
          otherPage.getByRole('heading', { level: 1, name: 'Tạo tài khoản để tham gia' }),
        ).toBeVisible();
        await expectAccessible(otherPage, 'Nhận lời mời');
        await expectNoSidewaysScroll(otherPage, 'Nhận lời mời');
      } finally {
        await other.close();
      }
    });
  }
});
