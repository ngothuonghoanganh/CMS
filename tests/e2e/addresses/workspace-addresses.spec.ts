import { type Browser, expect, type Page, test } from '@playwright/test';
import { meResponseSchema, RESET_PASSWORD_PATH, SIGNUP_VERIFY_PATH } from '@plp/contracts';
import {
  createAccountOnLinkPage,
  createSiteThroughForm,
  fillSignupForm,
  logInThroughForm,
} from '../support/flows.js';
import {
  accountLink,
  RESET_EMAIL_SUBJECT,
  SIGNUP_EMAIL_SUBJECT,
  waitForEmail,
} from '../support/mailpit.js';
import { type Account, newAccount, newSubdomain, uniqueId } from '../support/setup.js';
import { COMMON_ORIGIN, slugOf, workspaceAt } from './origins.js';

const NOT_MEMBER = 'Tài khoản này không thuộc workspace ở địa chỉ này';

/**
 * Signs up at the common address and confirms the email there (ADR-026); the new workspace opens
 * at its own address.
 */
async function signUpAtCommon(page: Page, account: Account): Promise<string> {
  await fillSignupForm(page, account, COMMON_ORIGIN);
  const email = await waitForEmail(page.request, account.email, SIGNUP_EMAIL_SUBJECT);
  const link = accountLink(email, SIGNUP_VERIFY_PATH);
  // The link leads to the common address, where a new account starts.
  expect(link.startsWith(`${COMMON_ORIGIN}${SIGNUP_VERIFY_PATH}#token=`)).toBe(true);
  await page.goto(link);
  await createAccountOnLinkPage(page, account);
  await expect(page).toHaveURL(/^http:\/\/[a-z0-9-]+\.app\.e2e\.test:3100\/sites\/new/);
  return slugOf(page.url());
}

/**
 * The workspace of the address the page is at. Asked from the page itself: Node, where
 * `page.request` runs, does not resolve `*.e2e.test` as Chromium is told to.
 */
async function workspaceIdOf(page: Page): Promise<string> {
  const body = await page.evaluate(async (): Promise<unknown> => {
    const response = await fetch('/api/auth/me');
    return (await response.json()) as unknown;
  });
  const me = meResponseSchema.parse(body);
  const id = me.memberships[0]?.workspace.id;
  if (id === undefined) {
    throw new Error('No workspace');
  }
  return id;
}

async function newPage(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
}

test.describe('workspace addresses (ADR-025)', () => {
  test('each workspace opens at its own address, and one sign-in opens them all', async ({
    page,
    browser,
    request,
  }) => {
    // Chủ sở hữu signs up at the common address and lands at their workspace's address.
    const owner = newAccount('Ngọc Anh', `Mây Xanh ${uniqueId()}`);
    const ownerSlug = await signUpAtCommon(page, owner);
    expect(ownerSlug).toMatch(/^may-xanh-/);
    const siteId = await createSiteThroughForm(page, {
      name: 'Nha khoa Smile Care',
      subdomain: newSubdomain(),
    });
    expect(slugOf(page.url())).toBe(ownerSlug);
    const ownerWorkspace = await workspaceIdOf(page);

    // Another person has a workspace of their own, and is invited to this one.
    const member = newAccount('Thu Hà', `Bếp Nhà Lá ${uniqueId()}`);
    const memberPage = await newPage(browser);
    const memberSlug = await signUpAtCommon(memberPage, member);
    await page.goto(`${workspaceAt(ownerSlug)}/workspaces/${ownerWorkspace}/members`);
    await page.getByRole('button', { name: 'Mời thành viên' }).click();
    const invite = page.getByRole('dialog', { name: 'Mời thành viên' });
    await invite.getByLabel('Email').fill(member.email);
    await invite.getByRole('radio', { name: /Biên tập/ }).check();
    await invite.getByRole('radio', { name: /Toàn workspace/ }).check();
    await invite.getByRole('button', { name: 'Gửi 1 lời mời' }).click();
    await expect(page.getByText('Đã gửi 1 lời mời', { exact: true })).toBeVisible();

    // The email links to the workspace's own address; joining opens the workspace there.
    const email = await waitForEmail(request, member.email, 'mời bạn vào');
    const link = new RegExp(`${workspaceAt(ownerSlug)}/invite#token=[A-Za-z0-9_-]{43}`).exec(
      email.Text,
    )?.[0];
    expect(link).toBeDefined();
    await memberPage.goto(link ?? '');
    await memberPage.getByRole('button', { name: 'Tham gia', exact: true }).click();
    await expect(memberPage).toHaveURL(`${workspaceAt(ownerSlug)}/sites/${siteId}`);

    // At the common address they pick between their two workspaces (screen 35).
    await memberPage.goto(`${COMMON_ORIGIN}/`);
    await expect(memberPage.getByRole('heading', { name: 'Chọn workspace' })).toBeVisible();
    await expect(memberPage.getByText(`${memberSlug}.app.e2e.test:3100`)).toBeVisible();
    await memberPage.getByRole('link', { name: `Mở ${owner.workspaceName}` }).click();
    await expect(memberPage).toHaveURL(`${workspaceAt(ownerSlug)}/sites/${siteId}`);

    // The sidebar opens the other workspace at its address, signed in already.
    await memberPage.getByRole('button', { name: /đổi workspace$/ }).click();
    await memberPage.getByRole('menuitemradio', { name: new RegExp(member.workspaceName) }).click();
    await expect(memberPage).toHaveURL(new RegExp(`^${workspaceAt(memberSlug)}/sites/new`));

    // A screen of one workspace opened at another's address moves to its own, same path.
    await memberPage.goto(`${workspaceAt(memberSlug)}/sites/${siteId}/leads`);
    await expect(memberPage).toHaveURL(`${workspaceAt(ownerSlug)}/sites/${siteId}/leads`);
    await memberPage.context().close();

    // Someone else, signed in, learns nothing about the workspace at this address (screen 36).
    const stranger = await newPage(browser);
    const strangerAccount = newAccount('Minh Khoa', 'Spa Hoa Sen');
    const strangerSlug = await signUpAtCommon(stranger, strangerAccount);
    await stranger.goto(`${workspaceAt(ownerSlug)}/`);
    await expect(stranger.getByRole('heading', { name: NOT_MEMBER })).toBeVisible();
    await expect(stranger.getByText(owner.workspaceName)).toHaveCount(0);
    // An address no workspace has reads the same.
    await stranger.goto(`${workspaceAt(`khong-co-${uniqueId()}`)}/`);
    await expect(stranger.getByRole('heading', { name: NOT_MEMBER })).toBeVisible();
    await stranger.getByRole('link', { name: 'Mở workspace của tôi' }).click();
    await expect(stranger).toHaveURL(new RegExp(`^${workspaceAt(strangerSlug)}/`));

    // Invited later, they open the link at the common address: the workspace joined still opens,
    // at its own address, not the list of their two workspaces.
    await page.getByRole('button', { name: 'Mời thành viên' }).click();
    const second = page.getByRole('dialog', { name: 'Mời thành viên' });
    await second.getByLabel('Email').fill(strangerAccount.email);
    await second.getByRole('radio', { name: /Biên tập/ }).check();
    await second.getByRole('radio', { name: /Toàn workspace/ }).check();
    await second.getByRole('button', { name: 'Gửi 1 lời mời' }).click();
    await expect(page.getByText('Đã gửi 1 lời mời', { exact: true })).toBeVisible();
    const strangerInvite = await waitForEmail(request, strangerAccount.email, 'mời bạn vào');
    const atWorkspace = new RegExp(`${workspaceAt(ownerSlug)}/invite#token=[A-Za-z0-9_-]{43}`).exec(
      strangerInvite.Text,
    )?.[0];
    expect(atWorkspace).toBeDefined();
    await stranger.goto((atWorkspace ?? '').replace(workspaceAt(ownerSlug), COMMON_ORIGIN));
    await stranger.getByRole('button', { name: 'Tham gia', exact: true }).click();
    await expect(stranger).toHaveURL(`${workspaceAt(ownerSlug)}/sites/${siteId}`);
    await stranger.context().close();
  });

  test('a password reset starts at a workspace’s address and links to the common one (ADR-026)', async ({
    page,
    browser,
  }) => {
    const owner = newAccount('Ngọc Anh', `Hoa Sen ${uniqueId()}`);
    const slug = await signUpAtCommon(page, owner);

    const visitor = await newPage(browser);
    await visitor.goto(`${workspaceAt(slug)}/login`);
    await visitor.getByRole('link', { name: 'Quên mật khẩu?' }).click();
    await expect(visitor).toHaveURL(`${workspaceAt(slug)}/forgot-password`);
    await visitor.getByLabel('Email').fill(owner.email);
    await visitor.getByRole('button', { name: 'Gửi link đặt lại mật khẩu' }).click();
    await expect(visitor.getByRole('status')).toContainText('Nếu email này có tài khoản');

    const email = await waitForEmail(visitor.request, owner.email, RESET_EMAIL_SUBJECT);
    const link = accountLink(email, RESET_PASSWORD_PATH);
    expect(link.startsWith(`${COMMON_ORIGIN}${RESET_PASSWORD_PATH}#token=`)).toBe(true);
    await visitor.goto(link);
    await visitor.getByLabel('Mật khẩu mới', { exact: true }).fill('MatKhau-moi-e2e-2027');
    await visitor.getByLabel('Nhập lại mật khẩu mới').fill('MatKhau-moi-e2e-2027');
    await visitor.getByRole('button', { name: 'Đặt mật khẩu mới' }).click();
    // Signed in on the cookie domain: the workspace opens at its own address.
    await expect(visitor).toHaveURL(new RegExp(`^${workspaceAt(slug)}/sites/new`));

    // The account page belongs to no workspace: it opens at the workspace's address too.
    await visitor.goto(`${workspaceAt(slug)}/account`);
    await expect(visitor.getByRole('heading', { level: 1, name: 'Tài khoản' })).toBeVisible();
    await expect(visitor.getByRole('textbox', { name: 'Email' })).toHaveValue(owner.email);
    await visitor.context().close();

    // The session of the sign-up ended with the reset.
    await page.goto(`${workspaceAt(slug)}/`);
    await expect(page).toHaveURL(`${workspaceAt(slug)}/login`);
  });

  test('signing in at a workspace’s address opens that workspace', async ({ page, browser }) => {
    const owner = newAccount('Ngọc Anh', `Smile ${uniqueId()}`);
    const slug = await signUpAtCommon(page, owner);

    const visitor = await newPage(browser);
    await visitor.goto(`${workspaceAt(slug)}/`);
    await expect(visitor).toHaveURL(`${workspaceAt(slug)}/login`);
    await expect(visitor.getByText(`${slug}.app.e2e.test:3100`)).toBeVisible();
    await expect(visitor.getByRole('link', { name: 'Tạo workspace mới' })).toHaveAttribute(
      'href',
      `${COMMON_ORIGIN}/signup`,
    );
    await logInThroughForm(visitor, owner);
    await expect(visitor).toHaveURL(new RegExp(`^${workspaceAt(slug)}/sites/new`));
    await visitor.context().close();
  });
});
