import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { LocalFilesystemAssetStorageProvider } from './asset-storage';

describe('LocalFilesystemAssetStorageProvider', () => {
  it('stores, reads, detects, and deletes opaque asset keys safely', async () => {
    const root = await mkdtemp(join(tmpdir(), 'payload-assets-'));
    const previousRoot = process.env.ASSET_STORAGE_ROOT;
    process.env.ASSET_STORAGE_ROOT = root;
    try {
      const provider = new LocalFilesystemAssetStorageProvider();
      const key = 'workspace-1/asset-1/hero.png';
      const bytes = Buffer.from('asset bytes');

      await provider.put(key, bytes);
      expect(await provider.exists(key)).toBe(true);
      await expect(provider.read(key)).resolves.toEqual(bytes);
      expect(provider.publicUrl(key)).toBe(
        '/api/v1/public/assets/workspace-1/asset-1/hero.png',
      );

      await provider.delete(key);
      expect(await provider.exists(key)).toBe(false);
      await expect(provider.delete(key)).resolves.toBeUndefined();
    } finally {
      if (previousRoot === undefined) delete process.env.ASSET_STORAGE_ROOT;
      else process.env.ASSET_STORAGE_ROOT = previousRoot;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects keys that escape the configured root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'payload-assets-'));
    const previousRoot = process.env.ASSET_STORAGE_ROOT;
    process.env.ASSET_STORAGE_ROOT = root;
    try {
      const provider = new LocalFilesystemAssetStorageProvider();
      await expect(
        provider.put('../outside.txt', Buffer.from('blocked')),
      ).rejects.toThrow(/escapes/i);
    } finally {
      if (previousRoot === undefined) delete process.env.ASSET_STORAGE_ROOT;
      else process.env.ASSET_STORAGE_ROOT = previousRoot;
      await rm(root, { recursive: true, force: true });
    }
  });
});
