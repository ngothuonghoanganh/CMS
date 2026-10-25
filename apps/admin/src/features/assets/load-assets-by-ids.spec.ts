import type { Asset, AssetListResponse } from '@plp/contracts';
import { describe, expect, it, vi } from 'vitest';
import { asset } from '../editor/test-fixtures';
import { loadAssetsByIds } from './load-assets-by-ids';

function id(index: number): string {
  return index.toString(16).padStart(24, '0');
}

function respond(ids: string): Promise<AssetListResponse> {
  const items: Asset[] = ids.split(',').map((value) => ({ ...asset, id: value }));
  return Promise.resolve({ items, nextCursor: null });
}

describe('loadAssetsByIds', () => {
  it('makes no request without ids', async () => {
    const lookup = vi.fn(respond);
    expect(await loadAssetsByIds([], lookup)).toEqual([]);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('asks once for up to 50 distinct ids, comma-separated', async () => {
    const lookup = vi.fn(respond);
    const assets = await loadAssetsByIds([id(1), id(2), id(1)], lookup);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith(`${id(1)},${id(2)}`);
    expect(assets.map((item) => item.id)).toEqual([id(1), id(2)]);
  });

  it('splits more than 50 ids into lookups of at most 50', async () => {
    const lookup = vi.fn(respond);
    const ids = Array.from({ length: 120 }, (_, index) => id(index + 1));
    const assets = await loadAssetsByIds(new Set(ids), lookup);
    expect(lookup.mock.calls.map(([value]) => value.split(',').length)).toEqual([50, 50, 20]);
    expect(assets.map((item) => item.id)).toEqual(ids);
  });

  it('leaves out ids the API does not return', async () => {
    const lookup = vi.fn(() =>
      Promise.resolve({ items: [{ ...asset, id: id(2) }], nextCursor: null }),
    );
    const assets = await loadAssetsByIds([id(1), id(2)], lookup);
    expect(assets.map((item) => item.id)).toEqual([id(2)]);
  });
});
