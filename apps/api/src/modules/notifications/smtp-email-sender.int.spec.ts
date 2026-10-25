import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { testEnvInput } from '../../../test/env.js';
import { parseEnv } from '../../config/env.js';
import { EmailSendError } from './email-sender.js';
import { SmtpEmailSender } from './smtp-email-sender.js';

/** Mailpit from docker compose (ADR-018): its HTTP API shows what the SMTP server received. */
const MAILPIT = process.env['MAILPIT_URL'] ?? 'http://localhost:8125';

function senderFor(smtpUrl?: string): SmtpEmailSender {
  return new SmtpEmailSender(
    parseEnv(
      testEnvInput({
        MONGODB_URI: 'mongodb://localhost:27117/unused',
        ...(smtpUrl === undefined ? {} : { SMTP_URL: smtpUrl }),
      }),
    ),
  );
}

interface MailpitSearch {
  messages: Array<{ ID: string; Subject: string; From: { Address: string; Name: string } }>;
}

describe('SmtpEmailSender', () => {
  it('hands a message to the SMTP server of SMTP_URL, from LEAD_EMAIL_FROM', async () => {
    const sender = senderFor();
    const subject = `Kiểm tra gửi thư ${randomUUID()}`;
    try {
      await sender.send({
        to: ['nhan-lead@example.com'],
        subject,
        text: 'Xin chào, đây là thư kiểm tra.',
        html: '<p>Xin chào, đây là thư kiểm tra.</p>',
      });
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
      const failure = await sender
        .send({ to: ['x@example.com'], subject: 'x', text: 'x', html: '<p>x</p>' })
        .then(
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
