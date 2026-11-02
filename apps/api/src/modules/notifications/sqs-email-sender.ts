import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { Logger, type OnModuleDestroy } from '@nestjs/common';
import { z } from 'zod';
import type { SqsMailEnv } from '../../config/env.js';
import { sqsErrorCode } from './domain/notification-rules.js';
import {
  type EmailDelivery,
  type EmailMessage,
  EmailSender,
  EmailSendError,
} from './email-sender.js';

/** SES takes at most 50 recipients per message, To, Cc and Bcc together. */
const MAX_RECIPIENTS = 50;

/**
 * The request plp-mailer takes, copied from its `src/contracts.ts` (ADR-029). Checked before
 * sending: the queue takes any body, and a request plp-mailer cannot read would only show up in
 * its dead-letter queue.
 */
export const mailerRequestSchema = z.strictObject({
  template: z
    .string()
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  to: z.array(z.email()).min(1).max(MAX_RECIPIENTS),
  replyTo: z.array(z.email()).min(1).max(5).optional(),
  data: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/),
});

export type MailerRequest = z.infer<typeof mailerRequestSchema>;

/** The request plp-mailer takes for one email. */
export function mailerRequestOf(message: EmailMessage): MailerRequest {
  return mailerRequestSchema.parse({
    template: message.template,
    to: [...message.to],
    data: message.data,
    idempotencyKey: message.idempotencyKey,
  });
}

/**
 * A slow or silent queue fails the attempt instead of holding the request that sends it. The SDK
 * retries a timeout twice, so an attempt gives up within about 20 seconds.
 */
export const SQS_TIMEOUTS = { connectionTimeout: 3_000, requestTimeout: 5_000 };

/**
 * Facts about a failed SendMessage that are safe to log, no recipient, no data and so no link: the
 * AWS error name, or a Node network code such as ECONNREFUSED, and the request id AWS support asks
 * for.
 */
function awsFailure(error: unknown): {
  awsError: string | null;
  errorCode: string | null;
  requestId: string | null;
} {
  if (typeof error !== 'object' || error === null) {
    return { awsError: null, errorCode: null, requestId: null };
  }
  const requestId =
    '$metadata' in error &&
    typeof error.$metadata === 'object' &&
    error.$metadata !== null &&
    'requestId' in error.$metadata &&
    typeof error.$metadata.requestId === 'string'
      ? error.$metadata.requestId
      : null;
  return {
    awsError: 'name' in error && typeof error.name === 'string' ? error.name : null,
    errorCode: 'code' in error && typeof error.code === 'string' ? error.code : null,
    requestId,
  };
}

/**
 * Queues each email for plp-mailer, which renders it with its templates and sends it with SES
 * (ADR-029). The queue taking the message is the send: SES failures and bounces stay with
 * plp-mailer (its dead-letter queue and alarms), and its idempotency keys keep the API's retries
 * from sending an email twice. Credentials come from the AWS SDK's default chain.
 */
export class SqsEmailSender extends EmailSender implements OnModuleDestroy {
  private readonly logger = new Logger(SqsEmailSender.name);
  private readonly client: SQSClient;
  private readonly queueUrl: string;

  constructor(
    env: Pick<SqsMailEnv, 'MAIL_QUEUE_URL' | 'MAIL_QUEUE_REGION'>,
    timeouts: typeof SQS_TIMEOUTS = SQS_TIMEOUTS,
  ) {
    super();
    this.queueUrl = env.MAIL_QUEUE_URL;
    // The queue URL's origin is the endpoint: the region's own for an AWS queue, a local one in
    // tests. Said explicitly, the SDK does not warn on every send that the two differ.
    this.client = new SQSClient({
      region: env.MAIL_QUEUE_REGION,
      endpoint: new URL(env.MAIL_QUEUE_URL).origin,
      // Without throwOnRequestTimeout the SDK only logs a request past its timeout and keeps waiting.
      requestHandler: { ...timeouts, throwOnRequestTimeout: true },
    });
  }

  async send(message: EmailMessage): Promise<EmailDelivery> {
    let request: MailerRequest;
    try {
      request = mailerRequestOf(message);
    } catch (error) {
      // A bug in the API, not something a retry fixes; the issues name fields, never values.
      this.logger.error(
        {
          template: message.template,
          issues:
            error instanceof z.ZodError
              ? error.issues.map((issue) => `${issue.path.join('.')}: ${issue.code}`)
              : null,
        },
        'Email does not match the plp-mailer request',
      );
      throw new EmailSendError('unknown', { cause: error });
    }
    try {
      await this.client.send(
        new SendMessageCommand({ QueueUrl: this.queueUrl, MessageBody: JSON.stringify(request) }),
      );
    } catch (error) {
      const code = sqsErrorCode(error);
      this.logger.warn(
        { template: request.template, code, ...awsFailure(error) },
        'Email not queued for plp-mailer',
      );
      throw new EmailSendError(code, { cause: error });
    }
    return { accepted: request.to.length, rejected: 0, rejectionCode: null };
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }
}
