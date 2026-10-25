import request from 'supertest';
import type { TestApp } from './app.js';
import type { TestClient } from './client.js';
import type { RecordingEmailSender } from './email.js';
import { TEST_ADMIN_ORIGIN } from './env.js';

export const RECIPIENT_EMAIL = 'sales@smilecare.vn';

/** The secret of the last confirmation link emailed to `email`. */
export function confirmationToken(emails: RecordingEmailSender, email: string): string {
  const message = emails
    .to(email)
    .filter((item) => item.subject.startsWith('Xác nhận nhận lead'))
    .at(-1);
  const token = /#token=([A-Za-z0-9_-]{43})/.exec(message?.text ?? '')?.[1];
  if (token === undefined) {
    throw new Error(`No confirmation link was emailed to ${email}`);
  }
  return token;
}

/** `POST /public/lead-recipients/confirm` from the admin's confirmation page, with no session. */
export function confirmRecipient(t: TestApp, token: string) {
  return request(t.app.getHttpServer())
    .post('/public/lead-recipients/confirm')
    .set('Origin', TEST_ADMIN_ORIGIN)
    .send({ token });
}

/**
 * Adds an address as the owner and confirms it through the link it was emailed, as its owner
 * would: what a page with a form needs before it can be published (ADR-018).
 */
export async function addConfirmedRecipient(
  t: TestApp,
  client: TestClient,
  siteId: string,
  email = RECIPIENT_EMAIL,
): Promise<void> {
  await client.post(`/sites/${siteId}/lead-recipients`, { email }).expect(201);
  await confirmRecipient(t, confirmationToken(t.emails, email)).expect(200);
}
