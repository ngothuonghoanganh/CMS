import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  AssetFolderListResponseSchema,
  AssetFolderSchema,
  CreateAssetFolderRequestSchema,
  UpdateAssetFolderRequestSchema,
  type AssetFolder,
  type CreateAssetFolderRequest,
  type UpdateAssetFolderRequest,
} from '@payload/contracts';
import {
  AssetFolderRecord,
  type AssetFolderDocument,
} from '../persistence/schemas/asset-folder.schema';
import { AssetRecord } from '../persistence/schemas/asset.schema';

@Injectable()
export class AssetFolderService {
  constructor(
    @InjectModel(AssetFolderRecord.name)
    private readonly folderModel: Model<AssetFolderRecord>,
    @InjectModel(AssetRecord.name)
    private readonly assetModel: Model<AssetRecord>,
  ) {}

  async list(workspaceId: string): Promise<{ items: AssetFolder[] }> {
    const records = await this.folderModel
      .find({ workspaceId })
      .sort({ name: 1, _id: 1 })
      .exec();
    return AssetFolderListResponseSchema.parse({
      items: records.map((record) => this.toContract(record)),
    });
  }

  async create(
    workspaceId: string,
    input: CreateAssetFolderRequest,
  ): Promise<AssetFolder> {
    const parsed = CreateAssetFolderRequestSchema.parse(input);
    await this.assertParent(workspaceId, parsed.parentId);
    try {
      return this.toContract(
        await this.folderModel.create({ _id: randomUUID(), workspaceId, ...parsed }),
      );
    } catch (error) {
      if (isDuplicateKeyError(error)) throw this.duplicate();
      throw error;
    }
  }

  async update(
    workspaceId: string,
    folderId: string,
    input: UpdateAssetFolderRequest,
  ): Promise<AssetFolder> {
    const parsed = UpdateAssetFolderRequestSchema.parse(input);
    const record = await this.require(workspaceId, folderId);
    if (parsed.parentId !== undefined) {
      const parentId = parsed.parentId ?? undefined;
      if (parentId === folderId) throw this.cycle();
      await this.assertParent(workspaceId, parentId);
      if (parentId && (await this.isDescendant(workspaceId, parentId, folderId)))
        throw this.cycle();
      if (parentId) record.parentId = parentId;
      else record.set('parentId', undefined);
    }
    if (parsed.name !== undefined) record.name = parsed.name;
    try {
      await record.save();
    } catch (error) {
      if (isDuplicateKeyError(error)) throw this.duplicate();
      throw error;
    }
    return this.toContract(record);
  }

  async remove(workspaceId: string, folderId: string): Promise<void> {
    await this.require(workspaceId, folderId);
    const [children, assets] = await Promise.all([
      this.folderModel.countDocuments({ workspaceId, parentId: folderId }).exec(),
      this.assetModel.countDocuments({ workspaceId, folderId }).exec(),
    ]);
    if (children || assets) {
      throw new ConflictException({
        code: 'ASSET_FOLDER_NOT_EMPTY',
        message: 'Move child folders and assets before deleting this folder',
        details: { childFolders: children, assets },
      });
    }
    await this.folderModel.deleteOne({ _id: folderId, workspaceId }).exec();
  }

  private async require(
    workspaceId: string,
    folderId: string,
  ): Promise<AssetFolderDocument> {
    const record = await this.folderModel.findOne({ _id: folderId, workspaceId }).exec();
    if (!record)
      throw new NotFoundException({
        code: 'ASSET_FOLDER_NOT_FOUND',
        message: 'Asset folder was not found',
      });
    return record;
  }

  private async assertParent(workspaceId: string, parentId?: string): Promise<void> {
    if (parentId) await this.require(workspaceId, parentId);
  }

  private async isDescendant(
    workspaceId: string,
    candidateId: string,
    folderId: string,
  ): Promise<boolean> {
    const seen = new Set<string>();
    let current: string | undefined = candidateId;
    while (current) {
      if (current === folderId) return true;
      if (seen.has(current)) return true;
      seen.add(current);
      const record = await this.folderModel
        .findOne({ _id: current, workspaceId })
        .select({ parentId: 1 })
        .exec();
      current = record?.parentId;
    }
    return false;
  }

  private toContract(record: AssetFolderDocument): AssetFolder {
    return AssetFolderSchema.parse({
      id: record._id.toString(),
      workspaceId: record.workspaceId,
      name: record.name,
      ...(record.parentId ? { parentId: record.parentId } : {}),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }
  private duplicate(): ConflictException {
    return new ConflictException({
      code: 'ASSET_FOLDER_NAME_CONFLICT',
      message: 'A folder with this name already exists here',
    });
  }
  private cycle(): ConflictException {
    return new ConflictException({
      code: 'ASSET_FOLDER_CYCLE',
      message: 'An asset folder cannot contain itself',
    });
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000,
  );
}
