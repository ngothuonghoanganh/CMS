import type { APIRequestContext } from '@playwright/test';
import { siteOrigin } from '../urls.js';

export interface PublicResponse {
  status: number;
  /** `Location` header of a redirect, otherwise undefined. */
  location: string | undefined;
  headers: Record<string, string>;
  html: string;
}

/**
 * One request to the renderer as an anonymous visitor would make it, without following redirects.
 * Pass the `request` fixture, which shares no cookies with the admin pages.
 */
export async function fetchPublic(
  request: APIRequestContext,
  subdomain: string,
  path: string,
): Promise<PublicResponse> {
  const response = await request.get(`${siteOrigin(subdomain)}${path}`, { maxRedirects: 0 });
  const headers = response.headers();
  return {
    status: response.status(),
    location: headers['location'],
    headers,
    html: await response.text(),
  };
}

const entities: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#x27;': "'",
};

/** Text of the first `<h1>` in server-rendered HTML; the page content without JavaScript. */
export function firstHeading(html: string): string | null {
  const match = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html);
  if (match?.[1] === undefined) {
    return null;
  }
  return match[1]
    .replace(/<[^>]+>/g, '')
    .replace(/&(?:amp|lt|gt|quot|#x27);/g, (entity) => entities[entity] ?? entity)
    .trim();
}
