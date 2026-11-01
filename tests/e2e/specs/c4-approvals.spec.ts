import { type APIRequestContext, type Browser, expect, type Page, test } from '@playwright/test';
import {
  approvalResponseSchema,
  createInvitationsResponseSchema,
  endpoints,
  meResponseSchema,
  pageDetailResponseSchema,
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
 * C4 (ADR-023): a Cộng tác viên sends the draft for approval; Chủ sở hữu hears by email and
 * publishes it ("Duyệt và xuất bản"), or refuses it with a reason the Cộng tác viên reads.
 */

const CONTRIBUTOR_NAME = 'Minh';
const EDITOR_LINK = /http:\/\/localhost:3100\/sites\/[a-f0-9]{24}\/pages\/[a-f0-9]{24}\/edit/;

interface Fixture {
  ownerEmail: string;
  siteId: string;
  pageId: string;
  contributorEmail: string;
}

/**
 * Chủ sở hữu with a promotion page that was never published, and a Cộng tác viên invited by email
 * and signed up from the link in `member` (its own cookie jar).
 */
async function setUp(
  owner: APIRequestContext,
  member: APIRequestContext,
  mail: APIRequestContext,
): Promise<Fixture> {
  const { account, site } = await setUpSite(owner);
  await setUpLeadCaptureViaApi(owner, site.id);
  const created = await createPageViaApi(
    owner,
    site.id,
    promoPage(`uu-dai-${uniqueId()}`, 'Giảm 30%'),
  );
  const contributorEmail = `ctv-${uniqueId()}@example.com`;
  await call(
    owner,
    'POST',
    endpoints.createInvitations.path(site.workspaceId),
    createInvitationsResponseSchema,
    { emails: [contributorEmail], role: 'contributor', siteIds: null },
  );
  const invitation = await waitForEmail(mail, contributorEmail, 'mời bạn vào');
  const token = /#token=([A-Za-z0-9_-]{43})/.exec(invitation.Text)?.[1];
  if (token === undefined) {
    throw new Error('No invitation link in the email');
  }
  await call(member, 'POST', endpoints.signupInvited.path(), meResponseSchema, {
    token,
    name: CONTRIBUTOR_NAME,
    password: PASSWORD,
  });
  return { ownerEmail: account.email, siteId: site.id, pageId: created.page.id, contributorEmail };
}

/** Sends the saved draft for approval through the API, as the dialog does. */
async function askViaApi(
  member: APIRequestContext,
  siteId: string,
  pageId: string,
  note: string,
): Promise<void> {
  const detail = await call(
    member,
    'GET',
    endpoints.getPage.path(siteId, pageId),
    pageDetailResponseSchema,
  );
  await call(
    member,
    'POST',
    endpoints.requestApproval.path(siteId, pageId),
    approvalResponseSchema,
    {
      expectedRevision: detail.draft.revision,
      expectedPublishedReleaseId: detail.page.liveRelease?.id ?? null,
      approvalId: null,
      note,
    },
  );
}

async function contributorPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

test.describe('C4 · requests to publish', () => {
  test('a Cộng tác viên sends the draft; Chủ sở hữu approves it from the email; it goes live', async ({
    page,
    browser,
    request,
  }) => {
    const member = await contributorPage(browser);
    try {
      const { ownerEmail, siteId, pageId, contributorEmail } = await setUp(
        page.request,
        member.request,
        request,
      );

      // The Cộng tác viên sends the draft from the editor.
      const memberEditor = new Editor(member);
      await memberEditor.goto(siteId, pageId);
      await memberEditor.topBar.getByRole('button', { name: 'Gửi duyệt' }).click();
      const ask = member.getByRole('dialog', { name: 'Gửi yêu cầu xuất bản' });
      await expect(ask.getByRole('region', { name: 'Kiểm tra trước khi xuất bản' })).toBeVisible();
      await expect(ask.getByRole('button', { name: 'Bỏ qua lần này' })).toHaveCount(0);
      await ask.getByRole('textbox', { name: /Ghi chú cho người duyệt/ }).fill('Ưu đãi tháng 11');
      await ask.getByRole('button', { name: 'Gửi yêu cầu duyệt' }).click();
      const sent = member.getByRole('dialog', { name: 'Đã gửi yêu cầu duyệt' });
      await expect(sent).toContainText('Chủ sở hữu và Quản trị sẽ nhận email');
      await sent.getByRole('button', { name: 'Tiếp tục chỉnh sửa' }).click();
      await expect(
        memberEditor.topBar.getByRole('button', { name: 'Đang chờ duyệt' }),
      ).toBeVisible();
      await expect(memberEditor.topBar.getByText('Chờ duyệt', { exact: true })).toBeVisible();

      // Chủ sở hữu follows the email to the page, reviews it and publishes it.
      const email = await waitForEmail(request, ownerEmail, 'gửi yêu cầu xuất bản');
      expect(email.Text).toContain('Ghi chú: Ưu đãi tháng 11');
      const link = EDITOR_LINK.exec(email.Text)?.[0];
      if (link === undefined) {
        throw new Error('No link to the page in the email');
      }
      await page.goto(link);
      const editor = new Editor(page);
      await expect(editor.canvas).toBeVisible();
      await expect(editor.topBar.getByText('Chờ duyệt', { exact: true })).toBeVisible();
      const dialog = await editor.openPublishDialog();
      await expect(dialog).toContainText(`${CONTRIBUTOR_NAME} gửi yêu cầu xuất bản ·`);
      await expect(dialog).toContainText('“Ưu đãi tháng 11”');
      await expect(dialog.getByRole('textbox', { name: /Ghi chú cho phiên bản/ })).toHaveValue(
        'Ưu đãi tháng 11',
      );
      const ignore = dialog.getByRole('button', { name: 'Bỏ qua lần này' });
      while ((await ignore.count()) > 0) {
        await ignore.first().click();
      }
      await dialog.getByRole('button', { name: 'Duyệt và xuất bản v1' }).click();
      await expect(page.getByRole('dialog', { name: 'v1 đã live' })).toBeVisible();

      // The Cộng tác viên hears it went live; the request is gone from the page.
      const published = await waitForEmail(request, contributorEmail, 'đã được xuất bản');
      expect(published.Text).toContain('đã duyệt và xuất bản phiên bản v1');
      await page.goto(`/sites/${siteId}`);
      const row = page.getByRole('row').filter({ hasText: 'Ưu đãi niềng răng tháng 11' });
      await expect(row).toContainText('Live');
      await expect(row).not.toContainText('Chờ duyệt');
    } finally {
      await member.context().close();
    }
  });

  test('Chủ sở hữu refuses with a reason; the Cộng tác viên reads it by email and in the editor', async ({
    page,
    browser,
    request,
  }) => {
    const member = await contributorPage(browser);
    try {
      const { siteId, pageId, contributorEmail } = await setUp(
        page.request,
        member.request,
        request,
      );
      await askViaApi(member.request, siteId, pageId, 'Nhờ anh chị xem giúp');

      // The page list marks the page; Chủ sở hữu opens it and refuses.
      await page.goto(`/sites/${siteId}`);
      await expect(
        page.getByRole('row').filter({ hasText: 'Ưu đãi niềng răng tháng 11' }),
      ).toContainText('Chờ duyệt');
      const editor = new Editor(page);
      await editor.goto(siteId, pageId);
      const dialog = await editor.openPublishDialog();
      await dialog.getByRole('button', { name: 'Từ chối', exact: true }).click();
      const refuse = page.getByRole('dialog', { name: `Từ chối yêu cầu của ${CONTRIBUTOR_NAME}` });
      await refuse.getByRole('textbox', { name: /Lý do/ }).fill('Giá ưu đãi chưa đúng');
      await refuse.getByRole('button', { name: 'Từ chối yêu cầu' }).click();
      await expect(page.getByText('Đã từ chối yêu cầu', { exact: true })).toBeVisible();
      await expect(editor.topBar.getByText('Chờ duyệt', { exact: true })).toHaveCount(0);

      const email = await waitForEmail(request, contributorEmail, 'chưa được duyệt');
      expect(email.Text).toContain('Lý do: Giá ưu đãi chưa đúng');

      const memberEditor = new Editor(member);
      await memberEditor.goto(siteId, pageId);
      await memberEditor.topBar.getByRole('button', { name: 'Gửi duyệt' }).click();
      const ask = member.getByRole('dialog', { name: 'Gửi yêu cầu xuất bản' });
      await expect(ask).toContainText('chưa duyệt yêu cầu');
      await expect(ask).toContainText('Lý do: Giá ưu đãi chưa đúng');
    } finally {
      await member.context().close();
    }
  });

  for (const viewport of SCAN_VIEWPORTS) {
    test(`the request and approval dialogs are accessible at ${viewport.width} px`, async ({
      page,
      browser,
      request,
    }) => {
      const member = await contributorPage(browser);
      try {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await member.setViewportSize({ width: viewport.width, height: viewport.height });
        const { siteId, pageId } = await setUp(page.request, member.request, request);
        await askViaApi(member.request, siteId, pageId, 'Nhờ anh chị xem giúp');

        const memberEditor = new Editor(member);
        await memberEditor.goto(siteId, pageId);
        await memberEditor.topBar.getByRole('button', { name: 'Đang chờ duyệt' }).click();
        const ask = member.getByRole('dialog', { name: 'Gửi yêu cầu xuất bản' });
        await expect(ask.getByRole('button', { name: 'Rút yêu cầu' })).toBeVisible();
        await expectAccessible(member, 'Gửi yêu cầu xuất bản');
        await expectNoSidewaysScroll(member, 'Gửi yêu cầu xuất bản');

        const editor = new Editor(page);
        await editor.goto(siteId, pageId);
        const dialog = await editor.openPublishDialog();
        await expect(dialog.getByRole('button', { name: 'Từ chối', exact: true })).toBeVisible();
        await expectAccessible(page, 'Duyệt yêu cầu xuất bản');
        await expectNoSidewaysScroll(page, 'Duyệt yêu cầu xuất bản');
        await dialog.getByRole('button', { name: 'Từ chối', exact: true }).click();
        await expect(page.getByRole('dialog', { name: /^Từ chối yêu cầu của/ })).toBeVisible();
        await expectAccessible(page, 'Từ chối yêu cầu xuất bản');
      } finally {
        await member.context().close();
      }
    });
  }
});
