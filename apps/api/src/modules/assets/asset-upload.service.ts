import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Asset, uploadAssetFieldsSchema } from '@plp/contracts';
import type { z } from 'zod';
import { validationFailed } from '../../shared/errors.js';
import { newObjectId } from '../../shared/persistence/object-id.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import { ActivityRepository } from '../activity/activity.repository.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { SitesService } from '../sites/sites.service.js';
import { ASSET_STORAGE, type AssetStorage, assetStorageKey } from './asset-storage.js';
import { AssetsRepository } from './assets.repository.js';
import { AssetsService } from './assets.service.js';
import { inspectImage, publishedImage } from './image-inspection.js';

/** Text fields of the multipart upload after `uploadAssetFieldsSchema` parsed them. */
export type UploadAssetFieldValues = z.output<typeof uploadAssetFieldsSchema>;

/** The part of a multer memory-storage file the upload reads. */
export interface UploadedImageFile {
  buffer: Buffer;
}

export const FILE_REQUIRED_MESSAGE = 'Chọn một ảnh để tải lên';

@Injectable()
export class AssetUploadService {
  private readonly logger = new Logger(AssetUploadService.name);

  constructor(
    @Inject(ASSET_STORAGE) private readonly storage: AssetStorage,
    private readonly assets: AssetsRepository,
    private readonly assetsService: AssetsService,
    private readonly activity: ActivityRepository,
    private readonly sites: SitesService,
    private readonly transactions: TransactionRunner,
  ) {}

  /**
   * Stores the image, then records it with an `asset.uploaded` activity in one transaction. An
   * object whose record fails to insert is left orphaned (harmless) but the failure is logged and
   * rethrown, never lost.
   */
  async upload(
    user: AuthenticatedUser,
    siteId: string,
    fields: UploadAssetFieldValues,
    file: UploadedImageFile | undefined,
  ): Promise<Asset> {
    const { scope, site } = await this.sites.access(user, siteId);
    if (!file) {
      throw validationFailed([
        { path: ['file'], code: 'required', message: FILE_REQUIRED_MESSAGE },
      ]);
    }
    const image = await inspectImage(file.buffer);
    const published = await publishedImage(file.buffer, image.mimeType);
    const assetId = newObjectId();
    const storageKey = assetStorageKey({
      workspaceId: scope.workspaceId,
      siteId: site._id,
      assetId,
      extension: image.extension,
    });
    await this.storage.put(storageKey, published.body, image.mimeType);

    let record;
    try {
      record = await this.transactions.run(async (tx) => {
        const created = await this.assets.create(
          scope,
          {
            id: assetId,
            siteId: site._id,
            storageKey,
            mimeType: image.mimeType,
            bytes: published.body.length,
            width: published.width,
            height: published.height,
            alt: fields.decorative ? null : fields.alt,
            decorative: fields.decorative,
          },
          tx,
        );
        await this.activity.record(scope, { siteId: site._id, type: 'asset.uploaded' }, tx);
        return created;
      });
    } catch (error) {
      this.logger.error(
        { err: error, storageKey, siteId: site._id.toHexString() },
        'Asset object stored but its record could not be inserted',
      );
      throw error;
    }
    return this.assetsService.toDto(record, { id: user.id.toHexString(), name: user.name });
  }
}
