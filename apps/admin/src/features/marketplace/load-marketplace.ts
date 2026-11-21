import { endpoints, type MarketplaceItemDetail } from '@plp/contracts';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { ApiError } from '../../lib/api-core';
import { serverApi } from '../../lib/server-api';

/**
 * One marketplace item at its current version, loaded once per request and shared with
 * `generateMetadata`. Call `loadWorkspaceContext(workspaceId)` first: it checks the session and
 * the membership. An unknown, draft or withdrawn item is a 404.
 */
export const loadMarketplaceItem = cache(
  async (workspaceId: string, itemId: string): Promise<MarketplaceItemDetail> => {
    try {
      return await serverApi(endpoints.getMarketplaceItem, [workspaceId, itemId]);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        notFound();
      }
      throw error;
    }
  },
);
