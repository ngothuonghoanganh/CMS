import { describe, expect, it, vi } from 'vitest';

import { PageService } from './page.service';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const siteId = '22222222-2222-4222-8222-222222222222';
const pageId = '33333333-3333-4333-8333-333333333333';
const currentVersionId = '44444444-4444-4444-8444-444444444444';
const nextVersionId = '55555555-5555-4555-8555-555555555555';
const layoutId = '66666666-6666-4666-8666-666666666666';
const layoutResourceId = '77777777-7777-4777-8777-777777777777';

const oldLayoutAttachments = [
  {
    id: layoutId,
    type: 'header' as const,
    resourceId: layoutResourceId,
    slot: 'page.header.top' as const,
    enabled: true,
  },
];

function pageRecord() {
  return {
    _id: { toString: () => pageId },
    workspaceId,
    siteId,
    currentDraftVersionId: currentVersionId,
    layoutAttachments: oldLayoutAttachments,
    set: vi.fn(),
  };
}

function payload(text: string) {
  return {
    version: 7 as const,
    metadata: { documentTitle: 'Lifecycle test' },
    root: {
      id: 'root',
      type: 'root' as const,
      props: {},
      children: [
        {
          id: 'section-1',
          type: 'section' as const,
          props: {},
          children: [
            {
              id: 'text-1',
              type: 'text' as const,
              props: { text },
              children: [],
            },
          ],
        },
      ],
    },
  };
}

function currentVersion() {
  const currentPayload = payload('Current');
  return {
    _id: currentVersionId,
    workspaceId,
    siteId,
    landingPageId: pageId,
    versionNumber: 2,
    payload: currentPayload,
    composition: {
      pageId,
      payload: currentPayload,
      attachments: [],
      layoutAttachments: oldLayoutAttachments,
      bindings: [],
      actions: [],
      resources: [],
      queries: [],
    },
  };
}

function createService(input: {
  pageModel: Record<string, unknown>;
  versionModel: Record<string, unknown>;
  pageExtensions: Record<string, unknown>;
}) {
  const service = Object.create(PageService.prototype) as PageService;
  const state = service as unknown as Record<string, unknown>;
  state.pageModel = input.pageModel;
  state.versionModel = input.versionModel;
  state.pageExtensions = input.pageExtensions;
  state.navigation = { validateInlineNavigationDocument: vi.fn() };
  return service;
}

describe('PageService version persistence lifecycle', () => {
  it('creates a version and advances the draft pointer atomically', async () => {
    const page = pageRecord();
    const current = currentVersion();
    const created = {
      _id: nextVersionId,
      workspaceId,
      siteId,
      landingPageId: pageId,
      versionNumber: 3,
      payload: payload('Next'),
      composition: {
        pageId,
        payload: payload('Next'),
        attachments: [],
        layoutAttachments: oldLayoutAttachments,
        bindings: [],
        actions: [],
        resources: [],
        queries: [],
      },
      createdAt: new Date('2026-09-24T00:00:00.000Z'),
    };
    const pageModel = {
      findOne: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(page) })),
      findOneAndUpdate: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(page) })),
    };
    const versionModel = {
      findOne: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(current) })),
      create: vi.fn().mockResolvedValue(created),
    };
    const pageExtensions = {
      synchronizeComposition: vi.fn().mockResolvedValue(undefined),
    };
    const service = createService({ pageModel, versionModel, pageExtensions });

    const result = await service.createVersion(
      pageId,
      { expectedVersionNumber: 2, payload: payload('Next') },
      workspaceId,
    );

    expect(result.versionNumber).toBe(3);
    expect(versionModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        landingPageId: pageId,
        versionNumber: 3,
      }),
    );
    expect(pageModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: pageId,
        workspaceId,
        currentDraftVersionId: currentVersionId,
      },
      expect.objectContaining({
        $set: expect.objectContaining({ currentDraftVersionId: nextVersionId }),
      }),
      { new: true },
    );
    expect(pageExtensions.synchronizeComposition).toHaveBeenCalledWith(
      pageId,
      workspaceId,
      expect.objectContaining({ layoutAttachments: oldLayoutAttachments }),
    );
  });

  it('does not overwrite a concurrent draft and removes the uncommitted version', async () => {
    const page = pageRecord();
    const created = {
      _id: nextVersionId,
      workspaceId,
      siteId,
      landingPageId: pageId,
      versionNumber: 3,
      payload: payload('Next'),
      composition: {
        pageId,
        payload: payload('Next'),
        attachments: [],
        layoutAttachments: oldLayoutAttachments,
        bindings: [],
        actions: [],
        resources: [],
        queries: [],
      },
      createdAt: new Date('2026-09-24T00:00:00.000Z'),
      deleteOne: vi.fn().mockResolvedValue(undefined),
    };
    const pageModel = {
      findOne: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(page) })),
      findOneAndUpdate: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(null) })),
    };
    const versionModel = {
      findOne: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(currentVersion()) })),
      create: vi.fn().mockResolvedValue(created),
    };
    const pageExtensions = { synchronizeComposition: vi.fn() };
    const service = createService({ pageModel, versionModel, pageExtensions });

    await expect(
      service.createVersion(
        pageId,
        { expectedVersionNumber: 2, payload: payload('Next') },
        workspaceId,
      ),
    ).rejects.toThrow('The page draft changed while this version was being created');

    expect(created.deleteOne).toHaveBeenCalledOnce();
    expect(pageExtensions.synchronizeComposition).not.toHaveBeenCalled();
  });

  it('restores the prior draft pointer and layout attachments after sync failure', async () => {
    const page = pageRecord();
    const created = {
      _id: nextVersionId,
      workspaceId,
      siteId,
      landingPageId: pageId,
      versionNumber: 3,
      payload: payload('Next'),
      composition: {
        pageId,
        payload: payload('Next'),
        attachments: [],
        layoutAttachments: oldLayoutAttachments,
        bindings: [],
        actions: [],
        resources: [],
        queries: [],
      },
      createdAt: new Date('2026-09-24T00:00:00.000Z'),
      deleteOne: vi.fn().mockResolvedValue(undefined),
    };
    const rollback = { exec: vi.fn().mockResolvedValue(page) };
    const pageModel = {
      findOne: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(page) })),
      findOneAndUpdate: vi
        .fn()
        .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(page) })
        .mockReturnValueOnce(rollback),
    };
    const versionModel = {
      findOne: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(currentVersion()) })),
      create: vi.fn().mockResolvedValue(created),
      deleteOne: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(undefined) })),
    };
    const pageExtensions = {
      synchronizeComposition: vi
        .fn()
        .mockRejectedValue(new Error('extension sync failed')),
    };
    const service = createService({ pageModel, versionModel, pageExtensions });

    await expect(
      service.createVersion(
        pageId,
        { expectedVersionNumber: 2, payload: payload('Next') },
        workspaceId,
      ),
    ).rejects.toThrow('extension sync failed');

    expect(versionModel.deleteOne).toHaveBeenCalledWith({ _id: nextVersionId });
    expect(pageModel.findOneAndUpdate).toHaveBeenNthCalledWith(
      2,
      {
        _id: pageId,
        workspaceId,
        currentDraftVersionId: nextVersionId,
      },
      {
        $set: {
          currentDraftVersionId: currentVersionId,
          layoutAttachments: oldLayoutAttachments,
        },
      },
    );
    expect(rollback.exec).toHaveBeenCalledOnce();
  });
});
