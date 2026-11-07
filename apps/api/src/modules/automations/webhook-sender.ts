import { Injectable } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { type ClientRequest, type IncomingMessage, request as httpRequest } from 'node:http';
import { request } from 'node:https';
import type { LookupFunction } from 'node:net';
import type { Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import { isBlockedAddress, webhookTarget } from './webhook-target.js';

/** How long a webhook may take to answer (ADR-034). */
export const WEBHOOK_TIMEOUT_MS = 10_000;

/** A call that did not succeed. `retryable` ones are tried again; the others fail the run. */
export class WebhookError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    readonly httpStatus: number | null = null,
    options?: { cause: unknown },
  ) {
    super(`Webhook failed: ${code}${httpStatus === null ? '' : ` ${httpStatus}`}`, options);
    this.name = 'WebhookError';
  }
}

export interface WebhookCall {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** Whether the answer is worth trying again: 408, 429 and 5xx (ADR-034). */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Calls webhooks safely (ADR-034): HTTPS on port 443 only; the name is resolved first and the
 * connection goes to the address that was checked, so a name that changes between the check and
 * the call cannot reach a private network. No redirect is followed, nothing of the answer but its
 * status is kept, and the call ends after 10 seconds. Integration tests replace this provider; E2E
 * sends to `WEBHOOK_TEST_RECEIVER`.
 */
@Injectable()
export class WebhookSender {
  constructor(@InjectEnv() private readonly env: Pick<Env, 'WEBHOOK_TEST_RECEIVER'>) {}

  async send(call: WebhookCall): Promise<number> {
    const url = webhookTarget(call.url);
    if (url === null) {
      throw new WebhookError('invalid_url', false);
    }
    const headers = {
      ...call.headers,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(call.body),
    };
    const receiver = this.env.WEBHOOK_TEST_RECEIVER;
    if (receiver !== undefined) {
      const test = new URL(receiver);
      return this.post(call.body, (callback) =>
        (test.protocol === 'https:' ? request : httpRequest)(
          test,
          {
            method: 'POST',
            headers: { ...headers, 'X-PLP-Target': url.href },
            agent: false,
            timeout: WEBHOOK_TIMEOUT_MS,
          },
          callback,
        ),
      );
    }
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    let addresses: Array<{ address: string; family: number }>;
    try {
      addresses = await lookup(hostname, { all: true, order: 'verbatim' });
    } catch (error) {
      throw new WebhookError('dns_failed', true, null, { cause: error });
    }
    const [first] = addresses;
    if (first === undefined || addresses.some((item) => isBlockedAddress(item.address))) {
      throw new WebhookError('blocked_address', false);
    }
    const pinned: LookupFunction = (_host, options, callback) => {
      if (typeof options === 'object' && options.all === true) {
        callback(null, [{ address: first.address, family: first.family }]);
        return;
      }
      callback(null, first.address, first.family);
    };
    return this.post(call.body, (callback) =>
      request(
        {
          host: hostname,
          servername: hostname,
          port: 443,
          path: `${url.pathname}${url.search}`,
          method: 'POST',
          headers,
          lookup: pinned,
          agent: false,
          timeout: WEBHOOK_TIMEOUT_MS,
        },
        callback,
      ),
    );
  }

  /** Sends the body; the answer's status only, its body is never read or kept. */
  private async post(
    body: string,
    open: (callback: (response: IncomingMessage) => void) => ClientRequest,
  ): Promise<number> {
    const status = await new Promise<number>((resolve, reject) => {
      const outgoing = open((response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      });
      outgoing.on('timeout', () => {
        outgoing.destroy(new WebhookError('timeout', true));
      });
      outgoing.on('error', (error) => {
        reject(
          error instanceof WebhookError
            ? error
            : new WebhookError('network', true, null, { cause: error }),
        );
      });
      outgoing.end(body);
    });
    if (status >= 200 && status < 300) {
      return status;
    }
    throw new WebhookError('http_error', isRetryableStatus(status), status);
  }
}
