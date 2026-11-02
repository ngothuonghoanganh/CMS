import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../config/env.js';
import { newObjectId } from '../../shared/persistence/object-id.js';
import { assetStorageKey, S3AssetStorage, siteStoragePrefix } from './asset-storage.js';

function storage(publicBaseUrl: string): S3AssetStorage {
  return new S3AssetStorage(
    parseEnv({
      MONGODB_URI: 'mongodb://localhost:27117/plp',
      ADMIN_ORIGIN: 'http://localhost:3100',
      PUBLIC_SITE_ORIGIN_TEMPLATE: 'http://{subdomain}.localhost:3101',
      RENDERER_INTERNAL_URL: 'http://localhost:3101',
      REVALIDATE_SECRET: 'r'.repeat(32),
      PREVIEW_SECRET: 'p'.repeat(32),
      LOGIN_ATTEMPT_SECRET: 'l'.repeat(32),
      RENDERER_API_SECRET: 'r'.repeat(32),
      SMTP_URL: 'smtp://localhost:1125',
      LEAD_EMAIL_FROM: 'Payload Landing Page <no-reply@payload.site>',
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

describe('siteStoragePrefix', () => {
  it("is the folder of the site's assets, and only of that site", () => {
    const workspaceId = newObjectId();
    const siteId = newObjectId();
    const prefix = siteStoragePrefix({ workspaceId, siteId });
    expect(
      assetStorageKey({ workspaceId, siteId, assetId: newObjectId(), extension: 'webp' }),
    ).toMatch(new RegExp(`^${prefix}`));
    expect(prefix.endsWith('/')).toBe(true);
    expect(
      assetStorageKey({
        workspaceId,
        siteId: newObjectId(),
        assetId: newObjectId(),
        extension: 'png',
      }).startsWith(prefix),
    ).toBe(false);
  });
});

describe('S3AssetStorage.deletePrefix', () => {
  it('refuses a prefix that is not a folder, before asking the storage anything', async () => {
    const assets = storage('http://localhost:9100/plp-assets');
    await expect(assets.deletePrefix('')).rejects.toThrow(/not a folder prefix/);
    await expect(assets.deletePrefix('public/64b0000000000000000000a1')).rejects.toThrow(
      /not a folder prefix/,
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
