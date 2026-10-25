import {
  type EmailErrorCode,
  type EmailMessage,
  EmailSender,
  EmailSendError,
} from '../src/modules/notifications/email-sender.js';

/**
 * Keeps the emails the API sends instead of sending them; every test app uses one (see
 * `createTestApp`). `failNext` makes the next sends fail, one code per send.
 */
export class RecordingEmailSender extends EmailSender {
  readonly sent: EmailMessage[] = [];
  private readonly failures: EmailErrorCode[] = [];

  failNext(...codes: EmailErrorCode[]): void {
    this.failures.push(...codes);
  }

  send(message: EmailMessage): Promise<void> {
    const failure = this.failures.shift();
    if (failure !== undefined) {
      return Promise.reject(new EmailSendError(failure, { cause: new Error('recorded failure') }));
    }
    this.sent.push(message);
    return Promise.resolve();
  }

  /** The emails one address received, oldest first. */
  to(address: string): EmailMessage[] {
    return this.sent.filter((message) => message.to.includes(address));
  }
}
