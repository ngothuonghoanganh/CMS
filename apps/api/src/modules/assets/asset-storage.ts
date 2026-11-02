import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';

/** Object storage for uploaded images. Only keys under `public/` are anonymously readable. */
export interface AssetStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /**
   * Copies an object inside the storage, never through the API (`CopyObject`): a template's images
   * and the pages made from it get copies of their own (ADR-030).
   */
  copy(sourceKey: string, targetKey: string): Promise<void>;
  /** Deletes one object; a key that holds nothing is not an error. */
  delete(key: string): Promise<void>;
  /** Deletes every object whose key starts with `prefix`; returns how many went. */
  deletePrefix(prefix: string): Promise<number>;
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

/** The prefix of every object of a site's assets: what deleting the site removes (ADR-027). */
export function siteStoragePrefix(site: { workspaceId: ObjectId; siteId: ObjectId }): string {
  return `public/${site.workspaceId.toHexString()}/${site.siteId.toHexString()}/`;
}

/**
 * `public/{workspaceId}/templates/{assetId}.{ext}`: an image of a workspace template (ADR-030). It
 * is outside every site's prefix, so deleting the site it was saved from leaves it; `templates` is
 * never a site id (24 hex digits). Public like the pages' images, for the template's preview.
 */
export function templateAssetStorageKey(input: {
  workspaceId: ObjectId;
  assetId: ObjectId;
  extension: string;
}): string {
  return `public/${input.workspaceId.toHexString()}/templates/${input.assetId.toHexString()}.${input.extension}`;
}

/** S3 deletes at most 1,000 keys per request, the size of a listing page. */
const DELETE_BATCH = 1_000;

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

  async copy(sourceKey: string, targetKey: string): Promise<void> {
    try {
      await this.client.send(
        new CopyObjectCommand({
          Bucket: this.bucket,
          Key: targetKey,
          CopySource: `${this.bucket}/${sourceKey.split('/').map(encodeURIComponent).join('/')}`,
          // The source's content type and cache headers come with it: keys are still unique per
          // image and objects never change.
          MetadataDirective: 'COPY',
        }),
      );
    } catch (error) {
      throw new Error(
        `Could not copy asset object "${sourceKey}" to "${targetKey}" in bucket "${this.bucket}"`,
        { cause: error },
      );
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      throw new Error(`Could not delete asset object "${key}" in bucket "${this.bucket}"`, {
        cause: error,
      });
    }
  }

  /**
   * Lists the keys under `prefix` a page at a time and deletes each page in one request. A key S3
   * could not delete fails the whole call, named in the error; what went stays gone, so calling
   * it again finishes the work.
   */
  async deletePrefix(prefix: string): Promise<number> {
    if (prefix === '' || !prefix.endsWith('/')) {
      throw new Error(`Refusing to delete objects under "${prefix}": not a folder prefix`);
    }
    let deleted = 0;
    let token: string | undefined;
    try {
      do {
        const page = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix,
            MaxKeys: DELETE_BATCH,
            ...(token === undefined ? {} : { ContinuationToken: token }),
          }),
        );
        const keys = (page.Contents ?? []).flatMap((object) =>
          object.Key === undefined ? [] : [{ Key: object.Key }],
        );
        if (keys.length > 0) {
          const result = await this.client.send(
            new DeleteObjectsCommand({
              Bucket: this.bucket,
              Delete: { Objects: keys, Quiet: true },
            }),
          );
          const failed = result.Errors ?? [];
          if (failed.length > 0) {
            throw new Error(
              `${failed.length} object(s) were not deleted, first "${failed[0]?.Key ?? '?'}": ${failed[0]?.Code ?? 'unknown'}`,
            );
          }
          deleted += keys.length;
        }
        token = page.IsTruncated === true ? page.NextContinuationToken : undefined;
      } while (token !== undefined);
    } catch (error) {
      throw new Error(`Could not delete the objects under "${prefix}" in bucket "${this.bucket}"`, {
        cause: error,
      });
    }
    return deleted;
  }

  publicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`;
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }
}
