import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  RENDERER_MAX_SKEW_SECONDS,
  type RendererSignatureInput,
  rendererSignaturePayload,
} from '@plp/contracts';

/** Hex HMAC-SHA256 of the request, as the renderer computes it (ADR-016). */
export function signRendererRequest(secret: string, input: RendererSignatureInput): string {
  return createHmac('sha256', secret).update(rendererSignaturePayload(input)).digest('hex');
}

export type RendererSignatureRejection =
  'missing_headers' | 'invalid_timestamp' | 'stale_timestamp' | 'invalid_signature';

export type RendererSignatureCheck =
  { ok: true } | { ok: false; reason: RendererSignatureRejection };

export interface SignedRequest extends Omit<RendererSignatureInput, 'timestamp'> {
  timestamp: string | undefined;
  signature: string | undefined;
}

/**
 * Accepts a request signed with `secret` within `RENDERER_MAX_SKEW_SECONDS` of `nowSeconds`. The
 * comparison takes the same time whatever the signature, so it leaks nothing about the secret.
 */
export function verifyRendererSignature(
  secret: string,
  request: SignedRequest,
  nowSeconds: number,
): RendererSignatureCheck {
  const { timestamp, signature, ...rest } = request;
  if (timestamp === undefined || signature === undefined) {
    return { ok: false, reason: 'missing_headers' };
  }
  if (!/^\d{1,12}$/.test(timestamp)) {
    return { ok: false, reason: 'invalid_timestamp' };
  }
  if (Math.abs(nowSeconds - Number(timestamp)) > RENDERER_MAX_SKEW_SECONDS) {
    return { ok: false, reason: 'stale_timestamp' };
  }
  if (!/^[0-9a-f]{64}$/.test(signature)) {
    return { ok: false, reason: 'invalid_signature' };
  }
  const expected = Buffer.from(signRendererRequest(secret, { ...rest, timestamp }), 'hex');
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) {
    return { ok: false, reason: 'invalid_signature' };
  }
  return { ok: true };
}
