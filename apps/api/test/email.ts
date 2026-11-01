import {
  type EmailDelivery,
  type EmailErrorCode,
  type EmailMessage,
  EmailSender,
  EmailSendError,
} from '../src/modules/notifications/email-sender.js';
import { type RenderedEmail, renderEmail } from '../src/modules/notifications/email-templates.js';
import { templateDataProblems } from './mail-templates.js';

/** An email as both transports see it: the template and data, and what SMTP would send. */
export type RecordedEmail = EmailMessage & RenderedEmail;

/** A send held back by `holdNext`. */
export interface HeldSend {
  /** Resolves once the held send began. */
  started: Promise<void>;
  /** Lets the held send go on, failing if `failNext` asked for it. */
  release: () => void;
}

/**
 * Keeps the emails the API sends instead of sending them; every test app uses one (see
 * `createTestApp`). `failNext` makes the next sends fail, one code per send; `refuse` makes the
 * server refuse an address while it accepts the others, like a deleted mailbox; `holdNext` keeps the
 * next send waiting, so a test can change a lead while its email is on the way.
 *
 * Every email must carry data plp-mailer renders (ADR-023), whichever transport the test means: one
 * it would refuse fails the send and is kept in `contractViolations`.
 */
export class RecordingEmailSender extends EmailSender {
  readonly sent: RecordedEmail[] = [];
  /** Emails whose data plp-mailer would refuse, with the problems. */
  readonly contractViolations: string[] = [];
  private readonly failures: EmailErrorCode[] = [];
  private readonly refused = new Set<string>();
  private held: { begin: () => void; released: Promise<void> } | null = null;

  failNext(...codes: EmailErrorCode[]): void {
    this.failures.push(...codes);
  }

  refuse(address: string): void {
    this.refused.add(address);
  }

  holdNext(): HeldSend {
    let begin = (): void => undefined;
    let release = (): void => undefined;
    const started = new Promise<void>((resolve) => {
      begin = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.held = { begin, released };
    return { started, release };
  }

  async send(message: EmailMessage): Promise<EmailDelivery> {
    const problems = templateDataProblems(message.template, message.data);
    if (problems.length > 0) {
      // The service would swallow a thrown error, so the test app reports these when it closes.
      const violation = `${message.template}: ${problems.join('; ')}`;
      this.contractViolations.push(violation);
      throw new EmailSendError('unknown', { cause: new Error(violation) });
    }
    const held = this.held;
    this.held = null;
    if (held !== null) {
      held.begin();
      await held.released;
    }
    const failure = this.failures.shift();
    if (failure !== undefined) {
      throw new EmailSendError(failure, { cause: new Error('recorded failure') });
    }
    const accepted = message.to.filter((address) => !this.refused.has(address));
    if (accepted.length === 0) {
      throw new EmailSendError('smtp_rejected', { cause: new Error('every address refused') });
    }
    this.sent.push({ ...message, ...renderEmail(message), to: accepted });
    const rejected = message.to.length - accepted.length;
    return {
      accepted: accepted.length,
      rejected,
      rejectionCode: rejected === 0 ? null : 'smtp_rejected',
    };
  }

  /** The emails one address received, oldest first. */
  to(address: string): RecordedEmail[] {
    return this.sent.filter((message) => message.to.includes(address));
  }
}
