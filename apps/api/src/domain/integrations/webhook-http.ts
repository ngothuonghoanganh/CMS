import http from 'node:http';
import https from 'node:https';

import {
  resolveSafeWebhookTarget,
  type WebhookUrlPolicyOptions,
} from './webhook-security';

type WebhookHttpOptions = WebhookUrlPolicyOptions & {
  timeoutMs?: number;
  maxRedirects?: number;
};

export type WebhookHttpResponse = {
  statusCode: number;
};

export async function postJsonWithRedirects(
  rawUrl: string,
  body: string,
  headers: Record<string, string>,
  options: WebhookHttpOptions = {},
): Promise<WebhookHttpResponse> {
  const maxRedirects = options.maxRedirects ?? 3;
  let currentUrl = rawUrl;

  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const target = await resolveSafeWebhookTarget(currentUrl, options);
    const response = await postJsonAtTarget(
      target,
      body,
      headers,
      options.timeoutMs ?? 10_000,
    );
    if (![301, 302, 303, 307, 308].includes(response.statusCode)) {
      return response;
    }

    const location = response.location;
    if (!location) return response;
    if (redirect === maxRedirects) return response;
    currentUrl = new URL(location, target.url).toString();
  }

  throw new Error('Webhook redirect policy exhausted');
}

type RawWebhookResponse = WebhookHttpResponse & { location?: string };

function postJsonAtTarget(
  target: Awaited<ReturnType<typeof resolveSafeWebhookTarget>>,
  body: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<RawWebhookResponse> {
  return new Promise((resolve, reject) => {
    const transport = target.url.protocol === 'https:' ? https : http;
    const request = transport.request(
      {
        method: 'POST',
        hostname: target.url.hostname,
        port: target.url.port || undefined,
        path: `${target.url.pathname}${target.url.search}`,
        headers: {
          ...headers,
          Host: target.url.host,
          'Content-Length': Buffer.byteLength(body),
        },
        lookup: (
          _hostname: string,
          _options: object,
          callback: (error: Error | null, address: string, family: number) => void,
        ) => callback(null, target.address, target.family),
        ...(target.url.protocol === 'https:' ? { servername: target.url.hostname } : {}),
      },
      (response) => {
        response.resume();
        resolve({
          statusCode: response.statusCode ?? 0,
          ...(response.headers.location ? { location: response.headers.location } : {}),
        });
      },
    );
    request.setTimeout(timeoutMs, () =>
      request.destroy(new Error('Webhook request timed out')),
    );
    request.once('error', reject);
    request.end(body);
  });
}
