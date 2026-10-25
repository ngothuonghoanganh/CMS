import { endpoints, type PageView } from '@plp/contracts';
import type { RendererEnv } from '../env';
import { sendSignedRelay } from './signed-relay';

/** A view is not worth holding a request open for: the API answers fast or the view is dropped. */
const RELAY_TIMEOUT_MS = 3000;

export interface PageViewRelayInput {
  subdomain: string;
  view: PageView;
  clientIp: string | null;
  userAgent: string;
  env: Pick<RendererEnv, 'API_PUBLIC_URL' | 'RENDERER_API_SECRET'>;
}

/**
 * Relays a live page's view to the API, signed (ADR-019). A view that cannot be counted is
 * dropped: it is logged with the status only, never with the view.
 */
export async function relayPageView(input: PageViewRelayInput): Promise<void> {
  let response: Response;
  try {
    response = await sendSignedRelay({
      path: endpoints.publicRecordPageView.path(input.subdomain),
      body: input.view,
      clientIp: input.clientIp,
      userAgent: input.userAgent,
      env: input.env,
      timeoutMs: RELAY_TIMEOUT_MS,
    });
  } catch (error) {
    console.error('Page view relay could not reach the API', {
      reason: error instanceof Error ? error.name : 'unknown',
    });
    return;
  }
  await response.body?.cancel();
  if (response.status !== 204) {
    console.error('Page view relay was refused by the API', { status: response.status });
  }
}
