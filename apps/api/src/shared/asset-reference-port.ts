import type { AssetUsageResponse } from '@payload/contracts';

export const ASSET_REFERENCE_PORT = Symbol('ASSET_REFERENCE_PORT');

export type AssetReferenceUsage = AssetUsageResponse['items'][number];

/** Cross-resource reference scan required by asset usage and deletion checks. */
export interface AssetReferencePort {
  scan(
    workspaceId: string,
    assetId: string,
    storageKey: string,
    publicUrl: string | undefined,
    onMatch: (usage: AssetReferenceUsage) => boolean | Promise<boolean>,
  ): Promise<void>;
}
