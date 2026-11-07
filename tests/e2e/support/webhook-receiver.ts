import { createHmac } from 'node:crypto';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';

/** Where the E2E API sends every webhook (`WEBHOOK_TEST_RECEIVER`, playwright.config.ts). */
export const WEBHOOK_RECEIVER_PORT = 4199;
export const WEBHOOK_RECEIVER_URL = `http://127.0.0.1:${WEBHOOK_RECEIVER_PORT}/hooks`;

export interface ReceivedWebhook {
  /** The address the step names, which the API would have called (`X-PLP-Target`). */
  target: string;
  headers: IncomingHttpHeaders;
  body: string;
}

/**
 * The "máy nhận thử" of Phase 3 (ADR-034): keeps what the API sent and answers with the statuses
 * a spec queues, 200 otherwise. One per spec file; Playwright runs one worker.
 */
export class WebhookReceiver {
  readonly received: ReceivedWebhook[] = [];
  private readonly answers: number[] = [];
  private server: Server | null = null;

  answerNext(...statuses: number[]): void {
    this.answers.push(...statuses);
  }

  async start(): Promise<void> {
    const server = createServer((incoming, answer) => {
      let body = '';
      incoming.on('data', (chunk: Buffer) => {
        body += chunk.toString('utf8');
      });
      incoming.on('end', () => {
        const target = incoming.headers['x-plp-target'];
        this.received.push({
          target: typeof target === 'string' ? target : '',
          headers: incoming.headers,
          body,
        });
        answer.writeHead(this.answers.shift() ?? 200).end();
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(WEBHOOK_RECEIVER_PORT, '127.0.0.1', resolve);
    });
    this.server = server;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (server !== null) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
}

/** Whether `X-PLP-Signature` is HMAC-SHA256 of "t.body" with the step's secret. */
export function signedWith(webhook: ReceivedWebhook, secret: string): boolean {
  const header = webhook.headers['x-plp-signature'];
  const match = typeof header === 'string' ? /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header) : null;
  if (match === null) {
    return false;
  }
  const expected = createHmac('sha256', secret).update(`${match[1]}.${webhook.body}`).digest('hex');
  return expected === match[2];
}
