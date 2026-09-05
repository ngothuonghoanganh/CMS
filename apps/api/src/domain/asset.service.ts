import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';

import {
  AssetListResponseSchema,
  AssetListQuerySchema,
  AssetSchema,
  type Asset,
  type AssetListResponse,
  type AssetListQuery,
  type CreateAssetRequest,
} from '@payload/contracts';

import { AssetRecord, type AssetDocument } from '../persistence/schemas/asset.schema';

@Injectable()
export class AssetService {
  constructor(
    @InjectModel(AssetRecord.name)
    private readonly assetModel: Model<AssetRecord>,
  ) {}

  async create(workspaceId: string, input: CreateAssetRequest): Promise<Asset> {
    const record = await this.assetModel.create({
      _id: randomUUID(),
      workspaceId,
      ...input,
    });
    return this.toContract(record);
  }

  async list(workspaceId: string, input: AssetListQuery): Promise<AssetListResponse> {
    const query = AssetListQuerySchema.parse(input);
    const filter: Record<string, unknown> = {
      workspaceId,
      ...(query.search
        ? { filename: { $regex: escapeRegex(query.search), $options: 'i' } }
        : {}),
      ...(query.mediaType
        ? { mimeType: { $regex: `^${query.mediaType}/`, $options: 'i' } }
        : {}),
    };
    const [records, total] = await Promise.all([
      this.assetModel
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(query.offset)
        .limit(query.limit)
        .exec(),
      this.assetModel.countDocuments(filter).exec(),
    ]);

    return AssetListResponseSchema.parse({
      items: records.map((record) => this.toContract(record)),
      pagination: {
        limit: query.limit,
        offset: query.offset,
        hasNextPage: query.offset + records.length < total,
        total,
      },
    });
  }

  async getById(workspaceId: string, assetId: string): Promise<Asset> {
    const record = await this.assetModel.findOne({ _id: assetId, workspaceId }).exec();
    if (!record) {
      throw this.notFound(assetId);
    }
    return this.toContract(record);
  }

  async remove(workspaceId: string, assetId: string): Promise<void> {
    const result = await this.assetModel.deleteOne({ _id: assetId, workspaceId }).exec();
    if (result.deletedCount === 0) {
      throw this.notFound(assetId);
    }
  }

  private toContract(record: AssetDocument): Asset {
    return AssetSchema.parse({
      createdAt: record.createdAt.toISOString(),
      filename: record.filename,
      id: record._id.toString(),
      mimeType: record.mimeType,
      size: record.size,
      storageKey: record.storageKey,
      updatedAt: record.updatedAt.toISOString(),
      workspaceId: record.workspaceId,
    });
  }

  private notFound(assetId: string): NotFoundException {
    return new NotFoundException({
      code: 'ASSET_NOT_FOUND',
      message: `Asset ${assetId} was not found`,
    });
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
