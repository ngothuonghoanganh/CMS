import { describe, expect, it, vi } from 'vitest';

import { PageDraftSchema } from '../../persistence/schemas/page-draft.schema';
import { PageDraftService } from './page-draft.service';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const siteId = '22222222-2222-4222-8222-222222222222';
const pageId = '33333333-3333-4333-8333-333333333333';
const draftId = '44444444-4444-4444-8444-444444444444';

const composition = {
  version: 1 as const,
  root: { id: 'root', type: 'root' as const, props: {}, children: [] },
  settings: {},
};

function cursor<T>(value: T) {
  return { exec: vi.fn().mockResolvedValue(value) };
}

function draftRecord(versionNumber = 4) {
  return {
    _id: draftId,
    workspaceId,
    siteId,
    pageId,
    versionNumber,
    composition,
    createdAt: new Date('2026-10-04T00:00:00.000Z'),
    updatedAt: new Date('2026-10-04T00:00:00.000Z'),
  };
}

function setup() {
  const service = Object.create(PageDraftService.prototype) as PageDraftService;
  const pageModel = { findOne: vi.fn().mockReturnValue(cursor({ _id: pageId, siteId })) };
  const siteModel = { findOne: vi.fn().mockReturnValue(cursor({ _id: siteId })) };
  const draftModel = {
    init: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue(draftRecord(1)),
    findOne: vi.fn().mockReturnValue(cursor(draftRecord())),
    findOneAndUpdate: vi.fn().mockReturnValue(cursor(draftRecord(5))),
    deleteOne: vi.fn().mockReturnValue(cursor({ deletedCount: 1 })),
  };
  const state = service as unknown as Record<string, unknown>;
  state.pageModel = pageModel;
  state.siteModel = siteModel;
  state.draftModel = draftModel;
  return { service, pageModel, siteModel, draftModel };
}

describe('PageDraftService', () => {
  it('creates one empty canonical Draft with revision 1', async () => {
    const { service, draftModel } = setup();
    const result = await service.createInitialDraft({ _id: pageId, workspaceId, siteId });

    expect(result.versionNumber).toBe(1);
    expect(draftModel.init).toHaveBeenCalledOnce();
    expect(draftModel.create).toHaveBeenCalledWith({
      _id: expect.any(String),
      workspaceId,
      siteId,
      pageId,
      versionNumber: 1,
      composition,
    });
  });

  it('uses a unique pageId index and reports duplicate insertion', async () => {
    const indexes = PageDraftSchema.indexes();
    expect(indexes).toContainEqual([
      { pageId: 1 },
      expect.objectContaining({ unique: true }),
    ]);
    const { service, draftModel } = setup();
    draftModel.create.mockRejectedValue({ code: 11000 });
    await expect(
      service.createInitialDraft({ _id: pageId, workspaceId, siteId }),
    ).rejects.toMatchObject({
      response: { code: 'DRAFT_ALREADY_EXISTS' },
    });
  });

  it('saves by atomic revision compare-and-swap and reloads the exact composition', async () => {
    const { service, draftModel } = setup();
    const nextComposition = {
      ...composition,
      root: {
        ...composition.root,
        children: [{ id: 'hero', type: 'section', props: {}, children: [] }],
      },
    };
    draftModel.findOneAndUpdate.mockReturnValue(
      cursor({ ...draftRecord(5), composition: nextComposition }),
    );
    draftModel.findOne.mockReturnValue(
      cursor({ ...draftRecord(5), composition: nextComposition }),
    );

    const saved = await service.saveDraft(
      pageId,
      { expectedVersionNumber: 4, composition: nextComposition },
      workspaceId,
    );
    const reloaded = await service.loadDraft(pageId, workspaceId);

    expect(saved.versionNumber).toBe(5);
    expect(reloaded.composition).toEqual(nextComposition);
    expect(draftModel.findOneAndUpdate).toHaveBeenCalledWith(
      { pageId, siteId, workspaceId, versionNumber: 4 },
      { $set: { composition: nextComposition }, $inc: { versionNumber: 1 } },
      { new: true, runValidators: true },
    );
  });

  it('rejects invalid canonical content before any database write', async () => {
    const { service, draftModel } = setup();
    await expect(
      service.saveDraft(
        pageId,
        {
          expectedVersionNumber: 4,
          composition: {
            ...composition,
            root: { ...composition.root, id: 'invalid-root' },
          },
        },
        workspaceId,
      ),
    ).rejects.toThrow();
    expect(draftModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('returns a deterministic conflict for a stale revision', async () => {
    const { service, draftModel } = setup();
    draftModel.findOneAndUpdate.mockReturnValue(cursor(null));
    await expect(
      service.saveDraft(pageId, { expectedVersionNumber: 4, composition }, workspaceId),
    ).rejects.toMatchObject({ response: { code: 'DRAFT_VERSION_CONFLICT' } });
  });

  it('fails closed for a foreign workspace, missing site, or wrong page', async () => {
    const { service, pageModel, siteModel, draftModel } = setup();
    pageModel.findOne.mockReturnValueOnce(cursor(null));
    await expect(service.loadDraft(pageId, 'other-workspace')).rejects.toMatchObject({
      response: { code: 'DRAFT_NOT_FOUND' },
    });
    expect(pageModel.findOne).toHaveBeenCalledWith({
      _id: pageId,
      workspaceId: 'other-workspace',
    });

    siteModel.findOne.mockReturnValueOnce(cursor(null));
    await expect(service.loadDraft(pageId, workspaceId)).rejects.toMatchObject({
      response: { code: 'DRAFT_NOT_FOUND' },
    });
    expect(siteModel.findOne).toHaveBeenCalledWith({ _id: siteId, workspaceId });

    pageModel.findOne.mockReturnValueOnce(cursor(null));
    await expect(
      service.saveDraft(
        'wrong-page',
        { expectedVersionNumber: 4, composition },
        workspaceId,
      ),
    ).rejects.toMatchObject({
      response: { code: 'DRAFT_NOT_FOUND' },
    });
    expect(draftModel.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
