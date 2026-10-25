import {
  CLIENT_IP_HEADER,
  CLIENT_UA_HEADER,
  CLIENT_UA_MAX,
  endpoints,
  type ProblemIssue,
  problemSchema,
  RENDERER_SIGNATURE_HEADER,
  RENDERER_TIMESTAMP_HEADER,
} from '@plp/contracts';
import type { RendererEnv } from '../env';
import { signRendererRequest } from './renderer-signature';

/** The API should answer well within this; a visitor waits on it. */
const RELAY_TIMEOUT_MS = 10_000;

export type RelayOutcome =
  | { kind: 'received' }
  | { kind: 'invalid'; issues: ProblemIssue[] }
  | { kind: 'rate_limited'; message: string }
  | { kind: 'not_found' }
  | { kind: 'failed' };

export interface RelayInput {
  subdomain: string;
  /** Already checked against the lead contract; sent as JSON. */
  body: unknown;
  clientIp: string | null;
  userAgent: string;
  env: Pick<RendererEnv, 'API_PUBLIC_URL' | 'RENDERER_API_SECRET'>;
  nowSeconds?: number;
}

/**
 * Sends a visitor's lead to the API, signed (ADR-016). The headers are built here from scratch:
 * nothing the visitor sent, such as a forged client address, can reach the API. Failures are
 * logged with the status only, never the lead.
 */
export async function relayLead(input: RelayInput): Promise<RelayOutcome> {
  const path = endpoints.publicSubmitLead.path(input.subdomain);
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
      path,
      clientIp,
      userAgent,
      body,
    }),
    [CLIENT_UA_HEADER]: userAgent,
  });
  if (clientIp !== '') {
    headers.set(CLIENT_IP_HEADER, clientIp);
  }
  let response: Response;
  try {
    response = await fetch(`${input.env.API_PUBLIC_URL}${path}`, {
      method: 'POST',
      headers,
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
    });
  } catch (error) {
    console.error('Lead relay could not reach the API', {
      reason: error instanceof Error ? error.name : 'unknown',
    });
    return { kind: 'failed' };
  }
  if (response.status === 200 || response.status === 201) {
    await response.body?.cancel();
    return { kind: 'received' };
  }
  if (response.status === 404) {
    await response.body?.cancel();
    return { kind: 'not_found' };
  }
  if (response.status === 422 || response.status === 429) {
    const problem = problemSchema.safeParse(await response.json().catch(() => null));
    if (problem.success) {
      return response.status === 422
        ? { kind: 'invalid', issues: problem.data.issues ?? [] }
        : { kind: 'rate_limited', message: problem.data.detail ?? problem.data.title };
    }
  } else {
    await response.body?.cancel();
  }
  console.error('Lead relay was refused by the API', { status: response.status });
  return { kind: 'failed' };
}
