import {
  CLIENT_IP_HEADER,
  CLIENT_UA_HEADER,
  CLIENT_UA_MAX,
  RENDERER_SIGNATURE_HEADER,
  RENDERER_TIMESTAMP_HEADER,
} from '@plp/contracts';
import type { RendererEnv } from '../env';
import { signRendererRequest } from './renderer-signature';

export interface SignedRelayInput {
  /** API path, e.g. "/public/sites/smilecare/leads". */
  path: string;
  /** Already checked against the contract; sent as JSON. */
  body: unknown;
  clientIp: string | null;
  userAgent: string;
  env: Pick<RendererEnv, 'API_PUBLIC_URL' | 'RENDERER_API_SECRET'>;
  /** How long the API may take before the relay gives up. */
  timeoutMs: number;
  nowSeconds?: number;
}

/**
 * POSTs a visitor's request to the API, signed (ADR-016). The headers are built here from scratch:
 * nothing the visitor sent, such as a forged client address, can reach the API. Throws when the
 * API cannot be reached; the caller decides what the visitor sees.
 */
export function sendSignedRelay(input: SignedRelayInput): Promise<Response> {
  const body = JSON.stringify(input.body);
  const timestamp = String(input.nowSeconds ?? Math.floor(Date.now() / 1000));
  const userAgent = input.userAgent.slice(0, CLIENT_UA_MAX);
  const clientIp = input.clientIp ?? '';
  const headers = new Headers({
    accept: 'application/json',
    'content-type': 'application/json',
    [RENDERER_TIMESTAMP_HEADER]: timestamp,
    [RENDERER_SIGNATURE_HEADER]: signRendererRequest(input.env.RENDERER_API_SECRET, {
      timestamp,
      method: 'POST',
      path: input.path,
      clientIp,
      userAgent,
      body,
    }),
    [CLIENT_UA_HEADER]: userAgent,
  });
  if (clientIp !== '') {
    headers.set(CLIENT_IP_HEADER, clientIp);
  }
  return fetch(`${input.env.API_PUBLIC_URL}${input.path}`, {
    method: 'POST',
    headers,
    body,
    cache: 'no-store',
    signal: AbortSignal.timeout(input.timeoutMs),
  });
}
