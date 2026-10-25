import { createHmac } from 'node:crypto';
import { type RendererSignatureInput, rendererSignaturePayload } from '@plp/contracts';

/** Hex HMAC-SHA256 of a relayed request, as the API verifies it (ADR-016). */
export function signRendererRequest(secret: string, input: RendererSignatureInput): string {
  return createHmac('sha256', secret).update(rendererSignaturePayload(input)).digest('hex');
}
