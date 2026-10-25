import { createHmac, randomUUID } from 'node:crypto';
import {
  CLIENT_IP_HEADER,
  CLIENT_UA_HEADER,
  endpoints,
  type PublicLeadRequest,
  type PublishResponse,
  RENDERER_SIGNATURE_HEADER,
  RENDERER_TIMESTAMP_HEADER,
  rendererSignaturePayload,
} from '@plp/contracts';
import request from 'supertest';
import type { TestApp } from './app.js';
import type { TestClient } from './client.js';
import { formDraft } from './compositions.js';
import { TEST_RENDERER_API_SECRET } from './env.js';
import { createPage, publish, replaceDraft } from './pages.js';

export const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
export const PHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';

/** A lead a person filled in properly, from the page script (12 s to fill, a submission id). */
export function leadBody(
  releaseId: string,
  overrides: Partial<PublicLeadRequest> = {},
): PublicLeadRequest {
  return {
    releaseId,
    submissionId: randomUUID(),
    name: 'Nguyễn Thu Hà',
    phone: '0901 234 567',
    email: '',
    message: '',
    consent: true,
    marketing: false,
    honeypot: '',
    elapsedMs: 12_000,
    source: { utmSource: null, utmMedium: null, utmCampaign: null, referrer: null },
    ...overrides,
  };
}

export interface VisitorOptions {
  /** The address the renderer reports; null when it trusts none. Default 203.0.113.7. */
  ip?: string | null;
  userAgent?: string;
  /** Unix seconds of the signature; defaults to now. */
  timestamp?: number;
  secret?: string;
  /** Sign this path instead of the request's, to test replays elsewhere. */
  signedPath?: string;
  /** Leave the signature headers out. */
  unsigned?: boolean;
}

/**
 * `POST /public/sites/:subdomain/leads` as the renderer sends it: JSON body, the visitor's address
 * and user agent, and the HMAC over them. Signs with `createHmac` directly rather than the API's
 * own helper, so the test does not reuse the code under test.
 */
export function submitLead(
  t: TestApp,
  subdomain: string,
  body: unknown,
  options: VisitorOptions = {},
) {
  const path = endpoints.publicSubmitLead.path(subdomain);
  const raw = JSON.stringify(body);
  const clientIp = options.ip === undefined ? '203.0.113.7' : (options.ip ?? '');
  const userAgent = options.userAgent ?? DESKTOP_UA;
  const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', options.secret ?? TEST_RENDERER_API_SECRET)
    .update(
      rendererSignaturePayload({
        timestamp,
        method: 'POST',
        path: options.signedPath ?? path,
        clientIp,
        userAgent,
        body: raw,
      }),
    )
    .digest('hex');
  let req = request(t.app.getHttpServer())
    .post(path)
    .set('content-type', 'application/json')
    .set(CLIENT_UA_HEADER, userAgent);
  if (clientIp !== '') {
    req = req.set(CLIENT_IP_HEADER, clientIp);
  }
  if (options.unsigned !== true) {
    req = req.set(RENDERER_TIMESTAMP_HEADER, timestamp).set(RENDERER_SIGNATURE_HEADER, signature);
  }
  return req.send(raw);
}

/** A page with a lead form, published as v1; the site must have consent settings. */
export async function createLiveFormPage(
  client: TestClient,
  siteId: string,
  slug: string,
  draft = formDraft(slug),
): Promise<{ pageId: string; published: PublishResponse }> {
  const page = await createPage(client, siteId, { title: 'Đăng ký tư vấn', slug });
  await replaceDraft(client, page.page.id, draft);
  return { pageId: page.page.id, published: await publish(client, page.page.id) };
}
