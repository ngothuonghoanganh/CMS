import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';

import {
  AssetListResponseSchema,
  AssetSchema,
  PaginationQuerySchema,
  type Asset,
  type AssetListResponse,
  type CreateAssetRequest,
  type PaginationQuery,
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

  async list(workspaceId: string, input: PaginationQuery): Promise<AssetListResponse> {
    const query = PaginationQuerySchema.parse(input);
    const [records, total] = await Promise.all([
      this.assetModel
        .find({ workspaceId })
        .sort({ createdAt: -1, _id: -1 })
        .skip(query.offset)
        .limit(query.limit)
        .exec(),
      this.assetModel.countDocuments({ workspaceId }).exec(),
    ]);

    return AssetListResponseSchema.parse({
      items: records.map((record) => this.toContract(record)),
      pagination: {
        ...query,
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
