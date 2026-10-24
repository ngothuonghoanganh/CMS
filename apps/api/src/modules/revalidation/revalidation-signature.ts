import { createHmac } from 'node:crypto';

/**
 * Signature of a revalidation request (ADR-009): hex HMAC-SHA256 of `${timestamp}.${rawBody}`.
 * The renderer recomputes it from the raw body and rejects stale timestamps.
 */
export function signRevalidation(secret: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}
