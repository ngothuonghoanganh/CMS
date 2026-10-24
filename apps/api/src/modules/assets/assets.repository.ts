import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { AssetMimeType } from '@plp/contracts';
import type { Model } from 'mongoose';
import {
  afterCursor,
  type KeysetPage,
  NEWEST_FIRST,
  toKeysetPage,
} from '../../shared/persistence/keyset.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { ASSET_MODEL, type AssetRecord } from './asset.schema.js';

export interface CreateAssetInput {
  /** Chosen before the upload, because the storage key contains it. */
  id: ObjectId;
  siteId: ObjectId;
  storageKey: string;
  mimeType: AssetMimeType;
  bytes: number;
  width: number;
  height: number;
  alt: string | null;
  decorative: boolean;
}

/** The minimum needed to check access to an asset through its site. */
export interface AssetAccessRef {
  id: ObjectId;
  siteId: ObjectId;
}

function byId(assets: readonly AssetRecord[]): Map<string, AssetRecord> {
  return new Map(assets.map((asset) => [asset._id.toHexString(), asset]));
}

function uniqueIds(ids: readonly ObjectId[]): ObjectId[] {
  return [...new Map(ids.map((id) => [id.toHexString(), id])).values()];
}

@Injectable()
export class AssetsRepository {
  constructor(@InjectModel(ASSET_MODEL) private readonly assets: Model<AssetRecord>) {}

  /** Inserts an asset uploaded by the scope's user. */
  async create(scope: WorkspaceScope, input: CreateAssetInput, tx?: Tx): Promise<AssetRecord> {
    const { id, ...fields } = input;
    const document = {
      _id: id,
      workspaceId: scope.workspaceId,
      ...fields,
      uploadedBy: scope.userId,
      createdAt: new Date(),
    };
    const [asset] = await this.assets.create([document], tx ? { session: tx } : {});
    if (!asset) {
      throw new Error('Asset insert returned no document');
    }
    return asset.toObject();
  }

  /** Assets of a site, newest first. */
  async listForSite(
    scope: WorkspaceScope,
    siteId: ObjectId,
    cursor: string | undefined,
    limit: number,
  ): Promise<KeysetPage<AssetRecord>> {
    const records = await this.assets
      .find({ workspaceId: scope.workspaceId, siteId, ...afterCursor(cursor) })
      .sort(NEWEST_FIRST)
      .limit(limit + 1)
      .lean<AssetRecord[]>()
      .exec();
    return toKeysetPage(records, limit);
  }

  findById(scope: WorkspaceScope, id: ObjectId): Promise<AssetRecord | null> {
    return this.assets
      .findOne({ _id: id, workspaceId: scope.workspaceId })
      .lean<AssetRecord>()
      .exec();
  }

  /** Unscoped lookup by id that only returns the asset's site, for access checks. */
  async findAccessRef(id: ObjectId): Promise<AssetAccessRef | null> {
    const asset = await this.assets
      .findById(id, { siteId: 1 })
      .lean<Pick<AssetRecord, '_id' | 'siteId'>>()
      .exec();
    return asset ? { id: asset._id, siteId: asset.siteId } : null;
  }

  /**
   * Changes the default description. The document is saved (not updated in place) so the
   * model-level alt/decorative rule validates the result.
   */
  async update(
    scope: WorkspaceScope,
    id: ObjectId,
    patch: { alt: string | null; decorative: boolean },
  ): Promise<AssetRecord | null> {
    const asset = await this.assets.findOne({ _id: id, workspaceId: scope.workspaceId }).exec();
    if (!asset) {
      return null;
    }
    asset.alt = patch.alt;
    asset.decorative = patch.decorative;
    await asset.save();
    return asset.toObject();
  }

  /** Assets of this site among `ids`, keyed by id hex; missing ids are absent (publish checks). */
  async findForSite(
    scope: WorkspaceScope,
    siteId: ObjectId,
    ids: readonly ObjectId[],
  ): Promise<Map<string, AssetRecord>> {
    const unique = uniqueIds(ids);
    if (unique.length === 0) {
      return new Map();
    }
    const assets = await this.assets
      .find({ workspaceId: scope.workspaceId, siteId, _id: { $in: unique } })
      .lean<AssetRecord[]>()
      .exec();
    return byId(assets);
  }

  /**
   * Unscoped variant of `findForSite` for public delivery, which has no user. The site comes from
   * the request host and the ids from a published release.
   */
  async findPublicForSite(
    siteId: ObjectId,
    ids: readonly ObjectId[],
  ): Promise<Map<string, AssetRecord>> {
    const unique = uniqueIds(ids);
    if (unique.length === 0) {
      return new Map();
    }
    const assets = await this.assets
      .find({ siteId, _id: { $in: unique } })
      .lean<AssetRecord[]>()
      .exec();
    return byId(assets);
  }
}
