import request from 'supertest';
import type { TestApp } from './app.js';
import type { TestClient } from './client.js';
import type { RecordingEmailSender } from './email.js';
import { TEST_ADMIN_ORIGIN } from './env.js';

export const RECIPIENT_EMAIL = 'sales@smilecare.vn';

/** What a confirmation link carries: its site (whose database holds the address) and secret. */
export interface ConfirmationLink {
  siteId: string;
  token: string;
}

/** Reads `#site=…&token=…` from the text of a confirmation email (ADR-025). */
export function confirmationLinkIn(text: string): ConfirmationLink | null {
  const match = /#site=([a-f0-9]{24})&token=([A-Za-z0-9_-]{43})/.exec(text);
  return match?.[1] === undefined || match[2] === undefined
    ? null
    : { siteId: match[1], token: match[2] };
}

/** The last confirmation link emailed to `email`. */
export function confirmationLink(emails: RecordingEmailSender, email: string): ConfirmationLink {
  const message = emails
    .to(email)
    .filter((item) => item.subject.startsWith('Xác nhận nhận lead'))
    .at(-1);
  const link = confirmationLinkIn(message?.text ?? '');
  if (link === null) {
    throw new Error(`No confirmation link was emailed to ${email}`);
  }
  return link;
}

/** `POST /public/lead-recipients/confirm` from the admin's confirmation page, with no session. */
export function confirmRecipient(t: TestApp, link: ConfirmationLink) {
  return request(t.app.getHttpServer())
    .post('/public/lead-recipients/confirm')
    .set('Origin', TEST_ADMIN_ORIGIN)
    .send(link);
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
  await confirmRecipient(t, confirmationLink(t.emails, email)).expect(200);
}
