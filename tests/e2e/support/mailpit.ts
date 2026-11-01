import { type APIRequestContext, expect } from '@playwright/test';

/** Mailpit from docker compose (ADR-018): every email the API sends in a test run lands here. */
export const MAILPIT = 'http://localhost:8125';

interface MailpitSummary {
  ID: string;
  Subject: string;
  To: Array<{ Address: string }>;
}

export interface MailpitMessage {
  ID: string;
  Subject: string;
  Text: string;
  HTML: string;
  To: Array<{ Address: string }>;
}

/**
 * Waits for the newest email to `to` whose subject contains `subject`, and reads it. With
 * `newerThan`, waits for one that is not that email, e.g. after "Gửi lại".
 */
export async function waitForEmail(
  request: APIRequestContext,
  to: string,
  subject: string,
  newerThan?: MailpitMessage,
): Promise<MailpitMessage> {
  let found: MailpitSummary | undefined;
  await expect
    .poll(
      async () => {
        const response = await request.get(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
        );
        const { messages } = (await response.json()) as { messages: MailpitSummary[] };
        found = messages.find((message) => message.Subject.includes(subject));
        return found !== undefined && found.ID !== newerThan?.ID;
      },
      { message: `an email to ${to} about "${subject}"`, timeout: 15_000 },
    )
    .toBe(true);
  if (found === undefined) {
    throw new Error('unreachable');
  }
  const message = await request.get(`${MAILPIT}/api/v1/message/${found.ID}`);
  return (await message.json()) as MailpitMessage;
}

/** The confirmation link of an address's email (ADR-018). */
export function confirmationLink(message: MailpitMessage): string {
  const link =
    /http:\/\/localhost:3100\/lead-recipients\/confirm#site=[a-f0-9]{24}&token=[A-Za-z0-9_-]{43}/.exec(
      message.Text,
    )?.[0];
  if (link === undefined) {
    throw new Error(`No confirmation link in "${message.Subject}"`);
  }
  return link;
}

/** Subjects of the account emails (ADR-026). */
export const SIGNUP_EMAIL_SUBJECT = 'Xác nhận email để tạo workspace';
export const RESET_EMAIL_SUBJECT = 'Đặt lại mật khẩu';

/**
 * The account link of an email (ADR-026): `{admin address}{path}#token=…`, at whichever address
 * the API's `ADMIN_ORIGIN` names.
 */
export function accountLink(message: MailpitMessage, path: string): string {
  const link = new RegExp(`https?://[a-z0-9.:-]+${path}#token=[A-Za-z0-9_-]{43}`).exec(
    message.Text,
  )?.[0];
  if (link === undefined) {
    throw new Error(`No ${path} link in "${message.Subject}"`);
  }
  return link;
}

/** The secret of an account link. */
export function tokenOf(link: string): string {
  return new URLSearchParams(new URL(link).hash.slice(1)).get('token') ?? '';
}
