import type { APIRequestContext, Browser, Page } from '@playwright/test';
import { createInvitationsResponseSchema, endpoints, meResponseSchema } from '@plp/contracts';
import { waitForEmail } from './mailpit.js';
import { call, PASSWORD, uniqueId } from './setup.js';

/** Invites `role` into the workspace and signs the invited person up from the email's link. */
export async function joinAs(
  owner: APIRequestContext,
  browser: Browser,
  mail: APIRequestContext,
  workspaceId: string,
  role: 'admin' | 'editor' | 'support',
  siteIds: string[] = [],
): Promise<Page> {
  const email = `${role}-${uniqueId()}@example.com`;
  await call(
    owner,
    'POST',
    endpoints.createInvitations.path(workspaceId),
    createInvitationsResponseSchema,
    { emails: [email], role, siteIds: role === 'admin' ? null : siteIds },
  );
  const invitation = await waitForEmail(mail, email, 'mời bạn vào');
  const token = /#token=([A-Za-z0-9_-]{43})/.exec(invitation.Text)?.[1];
  if (token === undefined) {
    throw new Error('No invitation link in the email');
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  await call(page.request, 'POST', endpoints.signupInvited.path(), meResponseSchema, {
    token,
    name: 'Bảo Ngọc',
    password: PASSWORD,
  });
  return page;
}
