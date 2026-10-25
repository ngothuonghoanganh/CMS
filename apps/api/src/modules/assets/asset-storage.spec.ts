import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../config/env.js';
import { newObjectId } from '../../shared/persistence/object-id.js';
import { assetStorageKey, S3AssetStorage } from './asset-storage.js';

function storage(publicBaseUrl: string): S3AssetStorage {
  return new S3AssetStorage(
    parseEnv({
      MONGODB_URI: 'mongodb://localhost:27117/plp',
      ADMIN_ORIGIN: 'http://localhost:3100',
      PUBLIC_SITE_ORIGIN_TEMPLATE: 'http://{subdomain}.localhost:3101',
      RENDERER_INTERNAL_URL: 'http://localhost:3101',
      REVALIDATE_SECRET: 'r'.repeat(32),
      PREVIEW_SECRET: 'p'.repeat(32),
      RENDERER_API_SECRET: 'r'.repeat(32),
      S3_ENDPOINT: 'http://localhost:9100',
      S3_REGION: 'us-east-1',
      S3_BUCKET: 'plp-assets',
      S3_ACCESS_KEY_ID: 'key',
      S3_SECRET_ACCESS_KEY: 'secret',
      S3_PUBLIC_BASE_URL: publicBaseUrl,
    }),
  );
}

describe('assetStorageKey', () => {
  it('places every asset under the public prefix, by workspace and site', () => {
    const workspaceId = newObjectId();
    const siteId = newObjectId();
    const assetId = newObjectId();
    expect(assetStorageKey({ workspaceId, siteId, assetId, extension: 'png' })).toBe(
      `public/${workspaceId.toHexString()}/${siteId.toHexString()}/${assetId.toHexString()}.png`,
    );
  });
});

describe('S3AssetStorage.publicUrl', () => {
  it('joins the public base URL and the key', () => {
    expect(storage('https://cdn.example.com/plp-assets').publicUrl('public/a/b/c.png')).toBe(
      'https://cdn.example.com/plp-assets/public/a/b/c.png',
    );
  });

  it('does not double a trailing slash of the base URL', () => {
    expect(storage('https://cdn.example.com/').publicUrl('public/a.png')).toBe(
      'https://cdn.example.com/public/a.png',
    );
  });
});
