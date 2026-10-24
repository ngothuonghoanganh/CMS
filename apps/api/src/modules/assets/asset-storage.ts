import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';

/** Object storage for uploaded images. Only keys under `public/` are anonymously readable. */
export interface AssetStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** URL a browser or the renderer can load the object from. */
  publicUrl(key: string): string;
}

/** Injection token: `@Inject(ASSET_STORAGE) storage: AssetStorage`; tests may override it. */
export const ASSET_STORAGE = Symbol('AssetStorage');

/** `public/{workspaceId}/{siteId}/{assetId}.{ext}`: unique per asset, so objects never change. */
export function assetStorageKey(input: {
  workspaceId: ObjectId;
  siteId: ObjectId;
  assetId: ObjectId;
  extension: string;
}): string {
  return `public/${input.workspaceId.toHexString()}/${input.siteId.toHexString()}/${input.assetId.toHexString()}.${input.extension}`;
}

/** S3-compatible storage (RustFS locally, any S3 provider in production; ADR-002, ADR-012). */
@Injectable()
export class S3AssetStorage implements AssetStorage, OnModuleDestroy {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(@InjectEnv() env: Env) {
    this.client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      // RustFS and MinIO serve buckets by path, not by virtual host.
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    });
    this.bucket = env.S3_BUCKET;
    this.publicBaseUrl = env.S3_PUBLIC_BASE_URL.replace(/\/+$/, '');
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          ContentLength: body.length,
          // Keys are unique per asset and objects are never overwritten.
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
    } catch (error) {
      throw new Error(`Could not store asset object "${key}" in bucket "${this.bucket}"`, {
        cause: error,
      });
    }
  }

  publicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`;
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }
}
