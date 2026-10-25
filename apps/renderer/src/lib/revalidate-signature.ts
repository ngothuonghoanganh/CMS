import { createHmac, timingSafeEqual } from 'node:crypto';
import { REVALIDATE_MAX_SKEW_SECONDS } from '@plp/contracts';

export type RevalidateRejection =
  'missing_headers' | 'invalid_timestamp' | 'stale_timestamp' | 'invalid_signature';

export type RevalidateVerdict = { ok: true } | { ok: false; reason: RevalidateRejection };

export interface SignedRevalidateRequest {
  secret: string;
  /** `x-plp-timestamp`: unix seconds as sent. */
  timestamp: string | null;
  /** `x-plp-signature`: hex HMAC-SHA256 of `${timestamp}.${rawBody}`. */
  signature: string | null;
  rawBody: string;
  nowSeconds: number;
}

/** The signature the API sends: hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`). */
export function signRevalidateRequest(secret: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

/**
 * Checks a revalidation webhook: the timestamp must be within the replay window and the signature
 * must match the raw body, compared in constant time.
 */
export function verifyRevalidateSignature(request: SignedRevalidateRequest): RevalidateVerdict {
  const { timestamp, signature } = request;
  if (timestamp === null || signature === null) {
    return { ok: false, reason: 'missing_headers' };
  }
  if (!/^\d{1,12}$/.test(timestamp)) {
    return { ok: false, reason: 'invalid_timestamp' };
  }
  if (Math.abs(request.nowSeconds - Number(timestamp)) > REVALIDATE_MAX_SKEW_SECONDS) {
    return { ok: false, reason: 'stale_timestamp' };
  }
  if (!/^[0-9a-f]{64}$/i.test(signature)) {
    return { ok: false, reason: 'invalid_signature' };
  }
  const expected = Buffer.from(
    signRevalidateRequest(request.secret, timestamp, request.rawBody),
    'hex',
  );
  const provided = Buffer.from(signature, 'hex');
  return timingSafeEqual(expected, provided)
    ? { ok: true }
    : { ok: false, reason: 'invalid_signature' };
}
