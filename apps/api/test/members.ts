import {
  createInvitationsResponseSchema,
  type CreateInvitationsRequest,
  INVITATION_PATH,
} from '@plp/contracts';
import type { TestApp } from './app.js';
import type { TestClient } from './client.js';

/** The token of the last invitation link emailed to `email` (from `#token=`). */
export function invitationToken(t: TestApp, email: string): string {
  const message = t.emails.to(email).at(-1);
  const token = message?.text.match(new RegExp(`${INVITATION_PATH}#token=([A-Za-z0-9_-]+)`))?.[1];
  if (token === undefined) {
    throw new Error(`No invitation link was emailed to ${email}`);
  }
  return token;
}

/** Invites `email` as the client (who must hold `members.manage`) and returns its link's token. */
export async function invite(
  t: TestApp,
  client: TestClient,
  workspaceId: string,
  email: string,
  grant: Omit<CreateInvitationsRequest, 'emails'> = { role: 'editor', siteIds: null },
): Promise<string> {
  const response = await client
    .post(`/workspaces/${workspaceId}/invitations`, { emails: [email], ...grant })
    .expect(200);
  const { results } = createInvitationsResponseSchema.parse(response.body);
  if (results[0]?.outcome !== 'sent') {
    throw new Error(`Inviting ${email} was ${results[0]?.outcome ?? 'not reported'}`);
  }
  return invitationToken(t, email);
}

let emailCounter = 0;

/** An email nobody uses yet in this test process. */
export function newEmail(prefix = 'moi'): string {
  emailCounter += 1;
  return `${prefix}-${process.pid.toString(36)}-${emailCounter.toString(36)}@smilecare.vn`;
}
