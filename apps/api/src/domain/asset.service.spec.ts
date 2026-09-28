import { describe, expect, it, vi } from 'vitest';
import type { Model } from 'mongoose';

import type { CollectionEntryVersionRecord } from '../persistence/schemas/collection.schema';
import type {
  LayoutExtensionRecord,
  LayoutExtensionVersionRecord,
} from '../persistence/schemas/layout-extension.schema';
import type { PageSeoSettingsRecord } from '../persistence/schemas/page-seo-settings.schema';
import type { PageVersionRecord } from '../persistence/schemas/page-version.schema';
import type { ReusableRecord } from '../persistence/schemas/reusable.schema';
import type { SiteRecord } from '../persistence/schemas/site.schema';
import type {
  TemplateRecord,
  TemplateVersionRecord,
} from '../persistence/schemas/template.schema';
import type { AssetReferencePort } from '../shared/asset-reference-port';
import { AssetReferenceAdapter } from './asset-reference.adapter';
import { AssetService } from './asset.service';

const workspaceA = '11111111-1111-4111-8111-111111111111';
const workspaceB = '22222222-2222-4222-8222-222222222222';
const assetId = '33333333-3333-4333-8333-333333333333';
const pageId = '44444444-4444-4444-8444-444444444444';

type QueryRecord = Record<string, unknown>;

type MockModel = {
  find: ReturnType<typeof vi.fn>;
  findOne: ReturnType<typeof vi.fn>;
  deleteOne: ReturnType<typeof vi.fn>;
};

function queryFor(records: readonly QueryRecord[], filter: QueryRecord) {
  const filtered = records.filter((record) => {
    if (typeof filter.workspaceId === 'string') {
      return record.workspaceId === filter.workspaceId;
    }
    if (filter.templateId && typeof filter.templateId === 'object') {
      const ids = (filter.templateId as { $in?: unknown }).$in;
      return Array.isArray(ids) && ids.includes(record.templateId);
    }
    if (typeof filter.templateId === 'string')
      return record.templateId === filter.templateId;
    if (typeof filter.resourceId === 'string')
      return record.resourceId === filter.resourceId;
    return true;
  });
  return {
    select: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    lean: vi.fn().mockReturnThis(),
    cursor: () =>
      (async function* () {
        yield* filtered;
      })(),
    exec: vi.fn().mockResolvedValue(filtered),
  };
}

function model(records: readonly QueryRecord[]): MockModel {
  return {
    find: vi.fn((filter: QueryRecord) => queryFor(records, filter)),
    findOne: vi.fn(() => ({
      exec: vi.fn().mockResolvedValue({
        _id: assetId,
        workspaceId: workspaceA,
        storageKey: '/assets/hero.png',
      }),
    })),
    deleteOne: vi.fn(() => ({
      exec: vi.fn().mockResolvedValue({ deletedCount: 1 }),
    })),
  };
}

function setup(options: {
  pageVersions?: readonly QueryRecord[];
  entryVersions?: readonly QueryRecord[];
  templates?: readonly QueryRecord[];
  templateVersions?: readonly QueryRecord[];
  reusables?: readonly QueryRecord[];
  layouts?: readonly QueryRecord[];
  layoutVersions?: readonly QueryRecord[];
  sites?: readonly QueryRecord[];
  seoSettings?: readonly QueryRecord[];
  pageCursorError?: boolean;
}) {
  const pageVersions = model(options.pageVersions ?? []);
  if (options.pageCursorError) {
    pageVersions.find.mockImplementation(() => {
      throw new Error('cursor unavailable');
    });
  }
  const entryVersions = model(options.entryVersions ?? []);
  const templateModel = model(options.templates ?? []);
  const templateVersionModel = model(options.templateVersions ?? []);
  const reusableModel = model(options.reusables ?? []);
  const layoutModel = model(options.layouts ?? []);
  const layoutVersionModel = model(options.layoutVersions ?? []);
  const siteModel = model(options.sites ?? []);
  const seoModel = model(options.seoSettings ?? []);
  const assetReferences = new AssetReferenceAdapter(
    pageVersions as unknown as Model<PageVersionRecord>,
    entryVersions as unknown as Model<CollectionEntryVersionRecord>,
    templateVersionModel as unknown as Model<TemplateVersionRecord>,
    templateModel as unknown as Model<TemplateRecord>,
    reusableModel as unknown as Model<ReusableRecord>,
    layoutVersionModel as unknown as Model<LayoutExtensionVersionRecord>,
    layoutModel as unknown as Model<LayoutExtensionRecord>,
    siteModel as unknown as Model<SiteRecord>,
    seoModel as unknown as Model<PageSeoSettingsRecord>,
  );
  const service = Object.create(AssetService.prototype) as AssetService;
  const state = service as unknown as {
    assetModel: Model<never>;
    assetReferences: AssetReferencePort;
  };
  state.assetModel = model([]) as unknown as Model<never>;
  state.assetReferences = assetReferences;
  return { service, pageVersions, state };
}

function pageVersion(
  versionNumber: number,
  value: unknown,
  workspaceId = workspaceA,
): QueryRecord {
  return {
    _id: `version-${versionNumber}`,
    workspaceId,
    landingPageId: pageId,
    versionNumber,
    payload: value,
    composition: undefined,
  };
}

describe('AssetService usage and deletion integrity', () => {
  it('allows an unused asset to be deleted after all sources are exhausted', async () => {
    const { service, state } = setup({});

    await service.remove(workspaceA, assetId);

    expect(state.assetModel.deleteOne).toHaveBeenCalledWith({
      _id: assetId,
      workspaceId: workspaceA,
    });
  });

  it('blocks a direct asset reference', async () => {
    const { service, state } = setup({
      pageVersions: [pageVersion(1, { image: assetId })],
    });

    await expect(service.remove(workspaceA, assetId)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ASSET_IN_USE' }),
    });
    expect(state.assetModel.deleteOne).not.toHaveBeenCalled();
  });

  it('finds references beyond the former 5000-record boundary', async () => {
    const records = Array.from({ length: 5_001 }, (_, index) =>
      pageVersion(index + 1, { text: `record-${index}` }),
    );
    records[5_000] = pageVersion(5_001, { image: assetId });
    const { service } = setup({ pageVersions: records });

    await expect(
      service.assertAssetCanBeDeleted(workspaceA, assetId),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ASSET_IN_USE' }),
    });
  });

  it('recognizes legacy storage-key references exactly', async () => {
    const { service } = setup({
      pageVersions: [pageVersion(1, { image: '/assets/hero.png' })],
    });

    await expect(
      service.assertAssetCanBeDeleted(workspaceA, assetId),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ASSET_IN_USE' }),
    });
  });

  it('caps usage display and reports truncation only after finding an extra match', async () => {
    const { service } = setup({
      pageVersions: Array.from({ length: 101 }, (_, index) =>
        pageVersion(index + 1, { image: assetId }),
      ),
    });

    await expect(service.usages(workspaceA, assetId)).resolves.toMatchObject({
      items: expect.any(Array),
      truncated: true,
    });
    const response = await service.usages(workspaceA, assetId);
    expect(response.items).toHaveLength(100);
  });

  it('does not count a reference from another workspace', async () => {
    const { service, pageVersions } = setup({
      pageVersions: [pageVersion(1, { image: assetId }, workspaceB)],
    });

    await service.assertAssetCanBeDeleted(workspaceA, assetId);

    expect(pageVersions.find).toHaveBeenCalledWith({ workspaceId: workspaceA });
  });

  it('fails closed when usage verification cannot complete', async () => {
    const { service, state } = setup({ pageCursorError: true });

    await expect(service.remove(workspaceA, assetId)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ASSET_USAGE_CHECK_INCOMPLETE' }),
    });
    expect(state.assetModel.deleteOne).not.toHaveBeenCalled();
  });
});
