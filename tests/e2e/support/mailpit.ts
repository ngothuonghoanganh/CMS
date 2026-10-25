import { type APIRequestContext, expect } from '@playwright/test';

/** Mailpit from docker compose (ADR-018): every email the API sends in a test run lands here. */
export const MAILPIT = 'http://localhost:8125';

interface MailpitSummary {
  ID: string;
  Subject: string;
  To: Array<{ Address: string }>;
}

export interface MailpitMessage {
  Subject: string;
  Text: string;
  HTML: string;
  To: Array<{ Address: string }>;
}

/** Waits for the newest email to `to` whose subject contains `subject`, and reads it. */
export async function waitForEmail(
  request: APIRequestContext,
  to: string,
  subject: string,
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
        return found !== undefined;
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
  const link = /http:\/\/localhost:3100\/lead-recipients\/confirm#token=[A-Za-z0-9_-]{43}/.exec(
    message.Text,
  )?.[0];
  if (link === undefined) {
    throw new Error(`No confirmation link in "${message.Subject}"`);
  }
  return link;
}
