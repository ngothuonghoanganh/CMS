import { Injectable, Logger } from '@nestjs/common';
import {
  REVALIDATE_SIGNATURE_HEADER,
  REVALIDATE_TIMESTAMP_HEADER,
  type RevalidateRequest,
  type RevalidationResult,
  siteCacheTag,
} from '@plp/contracts';
import type { Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import { signRevalidation } from './revalidation-signature.js';

export const REVALIDATE_TIMEOUT_MS = 3_000;
const ATTEMPTS = 2;

/**
 * Tells the renderer to drop its cache for a site after every pointer move (ADR-009): a signed
 * `POST {RENDERER_INTERNAL_URL}/api/revalidate`, 3 s timeout, retried once. It runs after the
 * database commit, so it never throws into the request: a failure is logged and reported as
 * `'failed'`, and the caller flags the activity so the UI can say so.
 */
@Injectable()
export class RevalidationClient {
  private readonly logger = new Logger(RevalidationClient.name);
  private readonly endpoint: string;
  private readonly secret: string;

  constructor(@InjectEnv() env: Env) {
    this.endpoint = `${env.RENDERER_INTERNAL_URL.replace(/\/+$/, '')}/api/revalidate`;
    this.secret = env.REVALIDATE_SECRET;
  }

  async revalidateSite(subdomain: string): Promise<RevalidationResult> {
    const body: RevalidateRequest = { tags: [siteCacheTag(subdomain)] };
    const rawBody = JSON.stringify(body);
    const failures: unknown[] = [];
    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
      try {
        await this.send(rawBody);
        return 'ok';
      } catch (error) {
        failures.push(error);
      }
    }
    this.logger.warn(
      { err: failures.at(-1), attempts: failures.length, subdomain, endpoint: this.endpoint },
      'Renderer revalidation failed; the live site may serve cached content for up to 5 minutes',
    );
    return 'failed';
  }

  private async send(rawBody: string): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [REVALIDATE_TIMESTAMP_HEADER]: timestamp,
        [REVALIDATE_SIGNATURE_HEADER]: signRevalidation(this.secret, timestamp, rawBody),
      },
      body: rawBody,
      signal: AbortSignal.timeout(REVALIDATE_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Renderer answered ${response.status} to the revalidation request`);
    }
  }
}
