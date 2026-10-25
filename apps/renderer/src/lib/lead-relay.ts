import { endpoints, type ProblemIssue, problemSchema } from '@plp/contracts';
import type { RendererEnv } from '../env';
import { sendSignedRelay } from './signed-relay';

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
 * Sends a visitor's lead to the API, signed (ADR-016; see `sendSignedRelay`). Failures are logged
 * with the status only, never the lead.
 */
export async function relayLead(input: RelayInput): Promise<RelayOutcome> {
  let response: Response;
  try {
    response = await sendSignedRelay({
      path: endpoints.publicSubmitLead.path(input.subdomain),
      body: input.body,
      clientIp: input.clientIp,
      userAgent: input.userAgent,
      env: input.env,
      timeoutMs: RELAY_TIMEOUT_MS,
      ...(input.nowSeconds === undefined ? {} : { nowSeconds: input.nowSeconds }),
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
