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

/** What the SMTP server did with the addresses of a message it took. */
export interface EmailDelivery {
  accepted: number;
  /** Refused one by one while the others were accepted, e.g. a mailbox that no longer exists. */
  rejected: number;
  /** Why the first refused address was refused; null when none was. */
  rejectionCode: EmailErrorCode | null;
}

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
  /**
   * Resolves once the server took the message for at least one address; rejects with
   * `EmailSendError` when it took none.
   */
  abstract send(message: EmailMessage): Promise<EmailDelivery>;
}
