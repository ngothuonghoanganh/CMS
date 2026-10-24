import { Inject, Injectable } from '@nestjs/common';
import type {
  Asset,
  AssetListResponse,
  CursorQuery,
  UpdateAssetRequest,
  UserRef,
} from '@plp/contracts';
import { notFound } from '../../shared/errors.js';
import { type ObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { UsersRepository } from '../auth/users.repository.js';
import { SitesService } from '../sites/sites.service.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { toAssetDto } from './asset-dto.js';
import { ASSET_STORAGE, type AssetStorage } from './asset-storage.js';
import type { AssetRecord } from './asset.schema.js';
import { AssetsRepository } from './assets.repository.js';

export const ASSET_NOT_FOUND = 'Không tìm thấy ảnh';

@Injectable()
export class AssetsService {
  constructor(
    @Inject(ASSET_STORAGE) private readonly storage: AssetStorage,
    private readonly assets: AssetsRepository,
    private readonly users: UsersRepository,
    private readonly sites: SitesService,
  ) {}

  /** Public URL of the stored object, for admin DTOs and public delivery alike. */
  publicUrl(record: Pick<AssetRecord, 'storageKey'>): string {
    return this.storage.publicUrl(record.storageKey);
  }

  /** Contract `Asset` when the uploader is already known (e.g. the current user). */
  toDto(record: AssetRecord, uploadedBy: UserRef): Asset {
    return toAssetDto(record, this.publicUrl(record), uploadedBy);
  }

  /** Contract `Asset`s with uploader names from a single users query. */
  async toDtos(records: readonly AssetRecord[]): Promise<Asset[]> {
    const users = await this.users.findRefs(records.map((record) => record.uploadedBy));
    return records.map((record) => {
      const uploadedBy = users.get(record.uploadedBy.toHexString());
      if (!uploadedBy) {
        throw new Error(
          `Asset ${record._id.toHexString()} refers to unknown user ${record.uploadedBy.toHexString()}`,
        );
      }
      return this.toDto(record, uploadedBy);
    });
  }

  async listForSite(
    scope: WorkspaceScope,
    siteId: ObjectId,
    query: CursorQuery,
  ): Promise<AssetListResponse> {
    const page = await this.assets.listForSite(scope, siteId, query.cursor, query.limit);
    return { items: await this.toDtos(page.items), nextCursor: page.nextCursor };
  }

  /** Changes the default description; access goes through the asset's site. */
  async update(
    user: AuthenticatedUser,
    assetId: string,
    input: UpdateAssetRequest,
  ): Promise<Asset> {
    const id = toObjectId(assetId, ASSET_NOT_FOUND);
    const ref = await this.assets.findAccessRef(id);
    if (!ref) {
      throw notFound(ASSET_NOT_FOUND);
    }
    const { scope } = await this.sites.accessById(user, ref.siteId, ASSET_NOT_FOUND);
    const updated = await this.assets.update(scope, id, {
      alt: input.decorative ? null : input.alt,
      decorative: input.decorative,
    });
    if (!updated) {
      throw notFound(ASSET_NOT_FOUND);
    }
    const [asset] = await this.toDtos([updated]);
    if (!asset) {
      throw new Error('Mapping one asset returned nothing');
    }
    return asset;
  }
}
