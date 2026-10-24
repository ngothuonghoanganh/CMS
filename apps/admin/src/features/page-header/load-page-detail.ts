import { endpoints, idSchema, type PageDetailResponse } from '@plp/contracts';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { ApiError } from '../../lib/api-core';
import { serverApi } from '../../lib/server-api';

/**
 * The page of a page-level workspace screen (SEO, history), loaded once per request and shared
 * with `generateMetadata`. Call `loadSiteContext(siteId)` first: it checks the session and the
 * site. A page that does not exist, belongs to another workspace or to another site is a 404.
 */
export const loadPageDetail = cache(
  async (siteId: string, pageId: string): Promise<PageDetailResponse> => {
    if (!idSchema.safeParse(pageId).success) {
      notFound();
    }
    let detail: PageDetailResponse;
    try {
      detail = await serverApi(endpoints.getPage, [pageId]);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        notFound();
      }
      throw error;
    }
    if (detail.page.siteId !== siteId) {
      notFound();
    }
    return detail;
  },
);
