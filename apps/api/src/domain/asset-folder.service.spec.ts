import { describe, expect, it, vi } from 'vitest';

import { AssetFolderService } from './asset-folder.service';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const otherWorkspaceId = '22222222-2222-4222-8222-222222222222';
const folderId = '33333333-3333-4333-8333-333333333333';
const childId = '44444444-4444-4444-8444-444444444444';

function query<T>(value: T) {
  return {
    select: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(value),
  };
}

function serviceWith(options: {
  findFolder: (filter: Record<string, unknown>) => unknown;
  childCount?: number;
  assetCount?: number;
}) {
  const service = Object.create(AssetFolderService.prototype) as AssetFolderService;
  const folderModel = {
    findOne: vi.fn((filter: Record<string, unknown>) =>
      query(options.findFolder(filter)),
    ),
    countDocuments: vi.fn().mockReturnValue(query(options.childCount ?? 0)),
    deleteOne: vi.fn().mockReturnValue(query({ deletedCount: 1 })),
  };
  const assetModel = {
    countDocuments: vi.fn().mockReturnValue(query(options.assetCount ?? 0)),
  };
  (
    service as unknown as {
      folderModel: typeof folderModel;
      assetModel: typeof assetModel;
    }
  ).folderModel = folderModel;
  (
    service as unknown as {
      folderModel: typeof folderModel;
      assetModel: typeof assetModel;
    }
  ).assetModel = assetModel;
  return { service, folderModel, assetModel };
}

describe('AssetFolderService workspace safety', () => {
  it('rejects a parent folder from another workspace', async () => {
    const { service } = serviceWith({
      findFolder: (filter) =>
        filter._id === otherWorkspaceId ? null : { _id: folderId },
    });

    await expect(
      service.create(workspaceId, { name: 'Marketing', parentId: otherWorkspaceId }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ASSET_FOLDER_NOT_FOUND' }),
    });
  });

  it('rejects moving a folder below one of its descendants', async () => {
    const current = {
      _id: folderId,
      workspaceId,
      name: 'Parent',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      set: vi.fn(),
      save: vi.fn(),
    };
    const { service } = serviceWith({
      findFolder: (filter) => {
        if (filter._id === folderId) return current;
        if (filter._id === childId) return { _id: childId, parentId: folderId };
        return null;
      },
    });

    await expect(
      service.update(workspaceId, folderId, { parentId: childId }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ASSET_FOLDER_CYCLE' }),
    });
  });

  it('blocks deleting folders that still contain children or assets', async () => {
    const { service, folderModel } = serviceWith({
      findFolder: () => ({ _id: folderId }),
      childCount: 1,
      assetCount: 0,
    });

    await expect(service.remove(workspaceId, folderId)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ASSET_FOLDER_NOT_EMPTY' }),
    });
    expect(folderModel.deleteOne).not.toHaveBeenCalled();
  });
});
