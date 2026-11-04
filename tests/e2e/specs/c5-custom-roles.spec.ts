import { type APIRequestContext, expect, test } from '@playwright/test';
import {
  createInvitationsResponseSchema,
  customRoleListResponseSchema,
  customRoleRef,
  endpoints,
  meResponseSchema,
} from '@plp/contracts';
import { expectAccessible, expectNoSidewaysScroll, SCAN_VIEWPORTS } from '../support/axe.js';
import { Editor } from '../support/editor.js';
import { waitForEmail } from '../support/mailpit.js';
import {
  call,
  createPageViaApi,
  PASSWORD,
  promoPage,
  setUpLeadCaptureViaApi,
  setUpSite,
  uniqueId,
} from '../support/setup.js';

/*
 * C5 (ADR-024): Chủ sở hữu makes "Trưởng nhóm nội dung" from Biên tập on board 16 (asks to
 * publish instead of publishing, sees leads), invites someone with it, and that person has exactly
 * that: leads in the sidebar, "Gửi duyệt" in the editor.
 */

const ROLE_NAME = 'Trưởng nhóm nội dung';

/** Invites `email` with the custom role and signs them up from the link into `member`'s jar. */
async function inviteAndJoin(
  owner: APIRequestContext,
  member: APIRequestContext,
  mail: APIRequestContext,
  workspaceId: string,
  roleId: string,
): Promise<string> {
  const email = `vai-tro-${uniqueId()}@example.com`;
  await call(
    owner,
    'POST',
    endpoints.createInvitations.path(workspaceId),
    createInvitationsResponseSchema,
    { emails: [email], role: customRoleRef(roleId), siteIds: null },
  );
  const invitation = await waitForEmail(mail, email, 'mời bạn vào');
  expect(invitation.Text).toContain(ROLE_NAME);
  const token = /#token=([A-Za-z0-9_-]{43})/.exec(invitation.Text)?.[1];
  if (token === undefined) {
    throw new Error('No invitation link in the email');
  }
  await call(member, 'POST', endpoints.signupInvited.path(), meResponseSchema, {
    token,
    name: 'Bảo Ngọc',
    password: PASSWORD,
  });
  return email;
}

test.describe('C5 · custom roles', () => {
  test('Chủ sở hữu makes a role from Biên tập; who holds it has exactly that', async ({
    page,
    browser,
    request,
  }) => {
    const { site } = await setUpSite(page.request);
    await setUpLeadCaptureViaApi(page.request, site.id);
    const created = await createPageViaApi(
      page.request,
      site.id,
      promoPage(`uu-dai-${uniqueId()}`, 'Giảm 30%'),
    );

    // Board 16: a copy of Biên tập that asks to publish and sees leads.
    await page.goto(`/workspaces/${site.workspaceId}/roles`);
    await page.getByRole('button', { name: 'Vai trò tùy chỉnh' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Vai trò mới' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Tên vai trò' }).fill(ROLE_NAME);
    await page
      .getByRole('group', { name: 'Xuất bản, cập nhật trang live' })
      .getByRole('button', { name: 'Yêu cầu' })
      .click();
    await page.getByRole('switch', { name: 'Xem lead, khách hàng, pipeline' }).click();
    const summary = page.getByRole('region', { name: 'Tóm tắt trước khi lưu' });
    await expect(summary).toContainText('Bỏ: Xuất bản, cập nhật trang live');
    await expect(summary).toContainText('Thêm: Gửi yêu cầu xuất bản (phải được duyệt)');
    await expect(summary).toContainText('Thêm: Xem lead, khách hàng, pipeline');
    await page.getByRole('button', { name: 'Lưu vai trò' }).click();
    await expect(page.getByText(`Đã lưu vai trò ${ROLE_NAME}`, { exact: true })).toBeVisible();
    // The editor stays on the saved role, now changing it.
    await expect(
      page.getByRole('heading', { level: 2, name: `Vai trò: ${ROLE_NAME}` }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Danh sách vai trò' })
        .getByRole('button', { name: new RegExp(`^${ROLE_NAME}`) }),
    ).toContainText('Tùy chỉnh · từ Biên tập');

    const roles = await call(
      page.request,
      'GET',
      endpoints.listCustomRoles.path(site.workspaceId),
      customRoleListResponseSchema,
    );
    const role = roles.items.find((item) => item.name === ROLE_NAME);
    if (role === undefined) {
      throw new Error('The role was not saved');
    }

    const context = await browser.newContext();
    try {
      const member = await context.newPage();
      await inviteAndJoin(page.request, member.request, request, site.workspaceId, role.id);
      await member.goto(`/sites/${site.id}`);
      const sidebar = member.getByRole('navigation', { name: 'Điều hướng chính' });
      await expect(sidebar.getByRole('button', { name: /Bảo Ngọc/ })).toContainText(ROLE_NAME);
      await expect(sidebar.getByRole('link', { name: /^Leads/ })).toBeVisible();
      await expect(sidebar.getByRole('link', { name: 'Thành viên' })).toHaveCount(0);

      const editor = new Editor(member);
      await editor.goto(site.id, created.page.id);
      await expect(editor.topBar.getByRole('button', { name: 'Gửi duyệt' })).toBeVisible();

      // Leads taken away on board 16: the member's next request is refused.
      await page.getByRole('switch', { name: 'Xem lead, khách hàng, pipeline' }).click();
      const saved = page.waitForResponse(
        (response) =>
          response.url().includes(`/custom-roles/${role.id}`) &&
          response.request().method() === 'PATCH',
      );
      await page.getByRole('button', { name: 'Lưu vai trò' }).click();
      expect((await saved).status()).toBe(200);
      await member.goto(`/sites/${site.id}`);
      await expect(
        member.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', {
          name: /^Leads/,
        }),
      ).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  for (const viewport of SCAN_VIEWPORTS) {
    test(`the custom role editor is accessible at ${viewport.width} px`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const { site } = await setUpSite(page.request);
      await page.goto(`/workspaces/${site.workspaceId}/roles`);
      await page.getByRole('button', { name: 'Vai trò tùy chỉnh' }).click();
      await page.getByRole('switch', { name: 'Xem lead, khách hàng, pipeline' }).click();
      await expect(page.getByRole('region', { name: 'Tóm tắt trước khi lưu' })).toContainText(
        'Thêm',
      );
      await expectAccessible(page, 'Vai trò tùy chỉnh');
      await expectNoSidewaysScroll(page, 'Vai trò tùy chỉnh');
    });
  }
});
