'use client';

import { type Asset, type AssetListResponse, endpoints } from '@plp/contracts';
import { type InfiniteData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from '../../lib/api';

export const ASSET_PAGE_SIZE = 24;

export function siteAssetsQueryKey(siteId: string) {
  return ['sites', siteId, 'assets'] as const;
}

/** The site's image library, newest first, one cursor page at a time ("Xem thêm"). */
export function useSiteAssets(siteId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: siteAssetsQueryKey(siteId),
    queryFn: ({ pageParam, signal }) =>
      api(endpoints.listAssets, [siteId], {
        query: { limit: ASSET_PAGE_SIZE, ...(pageParam === null ? {} : { cursor: pageParam }) },
        signal,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: AssetListResponse) => last.nextCursor,
    enabled,
  });
}

/** Puts a just-uploaded asset at the top of the cached library. */
export function usePrependAsset(siteId: string) {
  const queryClient = useQueryClient();
  return useCallback(
    (asset: Asset) => {
      queryClient.setQueryData<InfiniteData<AssetListResponse, string | null>>(
        siteAssetsQueryKey(siteId),
        (data) => {
          const [first, ...rest] = data?.pages ?? [];
          if (!data || !first) {
            return data;
          }
          return { ...data, pages: [{ ...first, items: [asset, ...first.items] }, ...rest] };
        },
      );
    },
    [queryClient, siteId],
  );
}
