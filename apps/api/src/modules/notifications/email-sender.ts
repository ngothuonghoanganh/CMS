import type { LeadNotificationErrorCode } from '@plp/contracts';

/** One email, in plain text and in HTML. */
export interface EmailMessage {
  to: readonly string[];
  subject: string;
  text: string;
  html: string;
}

/** Why an email was not sent, as a code logs and the inbox can show (ADR-018). */
export type EmailErrorCode = Exclude<LeadNotificationErrorCode, 'no_recipients'>;

export class EmailSendError extends Error {
  constructor(
    readonly code: EmailErrorCode,
    options: { cause: unknown },
  ) {
    super(`Email not sent: ${code}`, options);
    this.name = 'EmailSendError';
  }
}

/**
 * Sends emails. An abstract class so it can be the injection token: SMTP in the app, a recording
 * sender in integration tests.
 */
export abstract class EmailSender {
  /** Resolves once the server accepted the message; rejects with `EmailSendError` otherwise. */
  abstract send(message: EmailMessage): Promise<void>;
}
