import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { testSmtpEnv } from '../../../test/env.js';
import { type EmailMessage, EmailSendError } from './email-sender.js';
import { recipientConfirmationEmail } from './emails.js';
import { SmtpEmailSender } from './smtp-email-sender.js';

/** Mailpit from docker compose (ADR-018): its HTTP API shows what the SMTP server received. */
const MAILPIT = process.env['MAILPIT_URL'] ?? 'http://localhost:8125';

function senderFor(smtpUrl?: string): SmtpEmailSender {
  return new SmtpEmailSender(testSmtpEnv(smtpUrl === undefined ? {} : { SMTP_URL: smtpUrl }));
}

/** A confirmation email for a site of that name; its subject names the site. */
function confirmation(to: string, siteName: string): EmailMessage {
  return {
    to: [to],
    ...recipientConfirmationEmail({
      recipientId: '6724f0c2a1b2c3d4e5f60789',
      linkExpiresAt: new Date('2026-11-08T00:00:00.000Z'),
      siteName,
      invitedBy: 'Ngọc Anh',
      confirmUrl: 'http://localhost:3100/lead-recipients/confirm#token=abc',
      validDays: 7,
    }),
  };
}

interface MailpitSearch {
  messages: Array<{ ID: string; Subject: string; From: { Address: string; Name: string } }>;
}

describe('SmtpEmailSender', () => {
  it('renders an email and hands it to the SMTP server of SMTP_URL, from LEAD_EMAIL_FROM', async () => {
    const sender = senderFor();
    const siteName = `Kiểm tra gửi thư ${randomUUID()}`;
    const subject = `Xác nhận nhận lead của ${siteName}`;
    try {
      await sender.send(confirmation('nhan-lead@example.com', siteName));
    } finally {
      sender.onModuleDestroy();
    }
    const response = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`subject:"${subject}"`)}`,
    );
    const found = (await response.json()) as MailpitSearch;
    expect(found.messages).toHaveLength(1);
    expect(found.messages[0]).toMatchObject({
      Subject: subject,
      From: { Address: 'no-reply@payload.test', Name: 'Payload Landing Page' },
    });
  });

  it('reports a server it cannot reach as smtp_unavailable', async () => {
    const sender = senderFor('smtp://127.0.0.1:9');
    try {
      const failure = await sender.send(confirmation('x@example.com', 'x')).then(
        () => null,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(EmailSendError);
      expect(failure).toMatchObject({ code: 'smtp_unavailable' });
    } finally {
      sender.onModuleDestroy();
    }
  });
});
