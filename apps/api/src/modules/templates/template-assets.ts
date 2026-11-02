import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Composition } from '@plp/contracts';
import {
  isObjectIdString,
  newObjectId,
  type ObjectId,
  toObjectId,
} from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import {
  ASSET_STORAGE,
  type AssetStorage,
  assetStorageKey,
  templateAssetStorageKey,
} from '../assets/asset-storage.js';
import type { AssetRecord } from '../assets/asset.schema.js';
import { AssetsRepository, type CreateAssetInput } from '../assets/assets.repository.js';
import { extensionByMimeType } from '../assets/image-inspection.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { imageAssetIds, withAssetIds } from './domain/template-content.js';
import type { TemplateAssetRecord } from './template.schema.js';

/** Images copied for a template version: its composition names them by the template's ids. */
export interface TemplateImages {
  composition: Composition;
  assets: TemplateAssetRecord[];
}

/** Images copied into a site for a page made from a template: inserted with the page's write. */
export interface SiteImages {
  composition: Composition;
  assets: CreateAssetInput[];
}

/**
 * The images of workspace templates (ADR-030). An asset belongs to one site (ADR-012) and a page
 * names only its own site's assets, so images are copied twice, inside the storage (`CopyObject`,
 * never downloaded): into the template's own objects when a version is saved, so deleting the
 * source site leaves the template whole; and into new assets of the target site when a page is
 * made from it or a draft takes it.
 */
@Injectable()
export class TemplateAssets {
  private readonly logger = new Logger(TemplateAssets.name);

  constructor(
    @Inject(ASSET_STORAGE) private readonly storage: AssetStorage,
    private readonly assets: AssetsRepository,
  ) {}

  /**
   * Copies the images of a page's composition, all assets of `siteId`, into the template's
   * objects. An image whose asset is not in the site loses it, as any reference outside the site.
   */
  async toTemplate(
    scope: WorkspaceScope,
    siteId: ObjectId,
    composition: Composition,
  ): Promise<TemplateImages> {
    const ids = imageAssetIds(composition).filter(isObjectIdString);
    const found = await this.assets.findForSite(
      scope,
      siteId,
      ids.map((id) => toObjectId(id)),
    );
    const copies = [...found.values()].map((asset) => this.templateCopyOf(scope, asset));
    await this.copyAll(
      copies.map(({ source, record }) => ({ from: source, to: record.storageKey })),
      siteId,
    );
    return {
      composition: withAssetIds(
        composition,
        new Map(copies.map(({ sourceId, record }) => [sourceId, record.assetId])),
      ),
      assets: copies.map(({ record }) => record),
    };
  }

  /**
   * Copies a version's images into new assets of `siteId`, uploaded by the scope's user. Their
   * records are inserted by `insert` in the transaction that writes the page; when it fails,
   * `discard` deletes the objects.
   */
  async toSite(
    scope: WorkspaceScope,
    siteId: ObjectId,
    composition: Composition,
    templateAssets: readonly TemplateAssetRecord[],
  ): Promise<SiteImages> {
    const used = new Set(imageAssetIds(composition));
    const copies = templateAssets
      .filter((asset) => used.has(asset.assetId))
      .map((asset) => {
        const id = newObjectId();
        const input: CreateAssetInput = {
          id,
          siteId,
          storageKey: assetStorageKey({
            workspaceId: scope.workspaceId,
            siteId,
            assetId: id,
            extension: extensionByMimeType[asset.mimeType],
          }),
          mimeType: asset.mimeType,
          bytes: asset.bytes,
          width: asset.width,
          height: asset.height,
          alt: asset.alt,
          decorative: asset.decorative,
        };
        return { templateAsset: asset, input };
      });
    await this.copyAll(
      copies.map(({ templateAsset, input }) => ({
        from: templateAsset.storageKey,
        to: input.storageKey,
      })),
      siteId,
    );
    return {
      composition: withAssetIds(
        composition,
        new Map(
          copies.map(({ templateAsset, input }) => [templateAsset.assetId, input.id.toHexString()]),
        ),
      ),
      assets: copies.map(({ input }) => input),
    };
  }

  /** Records the copied images as the site's assets, in the transaction that writes the page. */
  async insert(
    scope: WorkspaceScope,
    assets: readonly CreateAssetInput[],
    tx: Tx,
  ): Promise<AssetRecord[]> {
    const records: AssetRecord[] = [];
    // One after the other: a session runs one operation at a time.
    for (const asset of assets) {
      records.push(await this.assets.create(scope, asset, tx));
    }
    return records;
  }

  /**
   * Deletes copied objects nothing will refer to: the write they were copied for failed. A failure
   * is logged, never thrown over the error that is being answered; a leftover is a public file
   * nothing refers to, as after a refused upload (ADR-027).
   */
  async discard(keys: readonly string[], siteId: ObjectId): Promise<void> {
    for (const key of keys) {
      try {
        await this.storage.delete(key);
      } catch (error) {
        this.logger.error(
          { err: error, storageKey: key, siteId: siteId.toHexString() },
          'Copied image of a template not removed from storage',
        );
      }
    }
  }

  private templateCopyOf(scope: WorkspaceScope, asset: AssetRecord) {
    const assetId = newObjectId();
    const record: TemplateAssetRecord = {
      assetId: assetId.toHexString(),
      storageKey: templateAssetStorageKey({
        workspaceId: scope.workspaceId,
        assetId,
        extension: extensionByMimeType[asset.mimeType],
      }),
      mimeType: asset.mimeType,
      bytes: asset.bytes,
      width: asset.width,
      height: asset.height,
      alt: asset.alt,
      decorative: asset.decorative,
    };
    return { sourceId: asset._id.toHexString(), source: asset.storageKey, record };
  }

  /**
   * Copies every object at once: a composition holds few images, bounded by its sections. When
   * one fails, the copies already made are deleted before the failure is thrown: nothing refers
   * to them.
   */
  private async copyAll(
    pairs: readonly { from: string; to: string }[],
    siteId: ObjectId,
  ): Promise<void> {
    const results = await Promise.allSettled(
      pairs.map(({ from, to }) => this.storage.copy(from, to)),
    );
    const failed = results.find((result) => result.status === 'rejected');
    if (failed === undefined) {
      return;
    }
    await this.discard(
      pairs.filter((_pair, index) => results[index]?.status === 'fulfilled').map(({ to }) => to),
      siteId,
    );
    throw new Error('Copying the images of a template failed', { cause: failed.reason });
  }
}
