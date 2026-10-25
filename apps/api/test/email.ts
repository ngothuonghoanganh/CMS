import {
  type EmailDelivery,
  type EmailErrorCode,
  type EmailMessage,
  EmailSender,
  EmailSendError,
} from '../src/modules/notifications/email-sender.js';

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
 */
export class RecordingEmailSender extends EmailSender {
  readonly sent: EmailMessage[] = [];
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
    this.sent.push({ ...message, to: accepted });
    const rejected = message.to.length - accepted.length;
    return {
      accepted: accepted.length,
      rejected,
      rejectionCode: rejected === 0 ? null : 'smtp_rejected',
    };
  }

  /** The emails one address received, oldest first. */
  to(address: string): EmailMessage[] {
    return this.sent.filter((message) => message.to.includes(address));
  }
}
