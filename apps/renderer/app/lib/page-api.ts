import { cookies } from 'next/headers';
import { cache } from 'react';

import { PublicLandingPageSchema, type PublicLandingPage } from '@payload/contracts';

const apiBaseUrl = process.env.RENDERER_API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

function uncachedApiUrl(path: string): string {
  // The request is already no-store; the nonce also bypasses Next dev's HMR
  // fetch cache so a publish/unpublish is visible on the very next request.
  return `${apiBaseUrl}${path}${path.includes('?') ? '&' : '?'}_rendererRequest=${Date.now()}`;
}

async function readPageResponse(response: Response): Promise<PublicLandingPage | null> {
  if (response.status === 404 || response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Page API request failed with status ${response.status}`);
  }

  const parsed = PublicLandingPageSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error('The page API returned an invalid public page payload');
  }

  return parsed.data;
}

export const getPublicPage = cache(async function getPublicPage(
  siteSlug: string,
  pageSlug: string,
): Promise<PublicLandingPage | null> {
  const response = await fetch(
    uncachedApiUrl(
      `/public/sites/${encodeURIComponent(siteSlug)}/pages/${encodeURIComponent(pageSlug)}`,
    ),
    { cache: 'no-store' },
  );
  return readPageResponse(response);
});

export const getPublicPageForHostname = cache(async function getPublicPageForHostname(
  hostname: string,
): Promise<PublicLandingPage | null> {
  const response = await fetch(
    uncachedApiUrl(`/public/domains/resolve?hostname=${encodeURIComponent(hostname)}`),
    { cache: 'no-store' },
  );
  return readPageResponse(response);
});

export const getPreviewPage = cache(async function getPreviewPage(
  pageId: string,
): Promise<PublicLandingPage | null> {
  const cookieHeader = (await cookies()).toString();
  const requestInit: RequestInit = { cache: 'no-store' };
  if (cookieHeader) {
    requestInit.headers = { cookie: cookieHeader };
  }
  const response = await fetch(
    uncachedApiUrl(`/preview/pages/${encodeURIComponent(pageId)}`),
    requestInit,
  );
  return readPageResponse(response);
});
