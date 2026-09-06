import { describe, expect, it, vi } from 'vitest';

import { PageService } from './page.service';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const siteId = '22222222-2222-4222-8222-222222222222';
const pageId = '33333333-3333-4333-8333-333333333333';
const targetVersionId = '77777777-7777-4777-8777-777777777777';
const publishedVersionId = '88888888-8888-4888-8888-888888888888';
const queryOne = '44444444-4444-4444-8444-444444444444';
const queryTwo = '55555555-5555-4555-8555-555555555555';
const collectionId = '66666666-6666-4666-8666-666666666666';

function payload(text: string) {
  return {
    version: 7 as const,
    metadata: { documentTitle: 'Restore test' },
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

function composition(payloadValue: ReturnType<typeof payload>, queryId: string) {
  return {
    pageId,
    payload: payloadValue,
    attachments: [],
    layoutAttachments: [],
    bindings: [],
    actions: [],
    resources: [],
    queries: [
      {
        id: queryId,
        source: { type: 'collection' as const, collectionId },
        filters: [],
        sort: [],
        limit: 20,
        offset: 0,
      },
    ],
  };
}

function setup(targetHasComposition: boolean) {
  const targetPayload = payload('A');
  const currentPayload = payload('B');
  const target = {
    _id: targetVersionId,
    workspaceId,
    siteId,
    landingPageId: pageId,
    versionNumber: 1,
    payload: targetPayload,
    ...(targetHasComposition
      ? { composition: composition(targetPayload, queryOne) }
      : {}),
  };
  const current = {
    _id: publishedVersionId,
    workspaceId,
    siteId,
    landingPageId: pageId,
    versionNumber: 2,
    payload: currentPayload,
    composition: composition(currentPayload, queryTwo),
  };
  const page = {
    _id: { toString: () => pageId },
    workspaceId,
    siteId,
    currentDraftVersionId: publishedVersionId,
    publishedVersionId,
    set: vi.fn(),
    layoutAttachments: [
      {
        id: '77777777-7777-4777-8777-777777777777',
        type: 'header',
        resourceId: '88888888-8888-4888-8888-888888888888',
        slot: 'page.header.top',
        enabled: true,
      },
    ],
  };
  let createdInput: Record<string, unknown> | undefined;
  const pageModel = {
    findOne: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(page) })),
    findOneAndUpdate: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(page) })),
  };
  const versionModel = {
    findOne: vi.fn((filter: Record<string, unknown>) => ({
      exec: vi.fn().mockResolvedValue(filter.versionNumber === 1 ? target : current),
    })),
    create: vi.fn(async (input: Record<string, unknown>) => {
      createdInput = input;
      return {
        ...input,
        _id: '99999999-9999-4999-8999-999999999999',
        createdAt: new Date('2026-09-06T00:00:00.000Z'),
      };
    }),
  };
  const pageExtensions = { synchronizeComposition: vi.fn() };
  const service = Object.create(PageService.prototype) as PageService;
  const state = service as unknown as {
    pageModel: typeof pageModel;
    versionModel: typeof versionModel;
    pageExtensions: typeof pageExtensions;
  };
  state.pageModel = pageModel;
  state.versionModel = versionModel;
  state.pageExtensions = pageExtensions;
  return {
    service,
    page,
    pageModel,
    versionModel,
    pageExtensions,
    getCreated: () => createdInput,
  };
}

describe('PageService historical restore', () => {
  it('restores the target payload and composition without moving the published pointer', async () => {
    const { service, page, pageExtensions, getCreated } = setup(true);

    const restored = await service.restoreVersion(
      pageId,
      1,
      { expectedCurrentVersionNumber: 2 },
      workspaceId,
    );
    const created = getCreated();

    expect(restored.versionNumber).toBe(3);
    expect(created?.payload).toEqual(payload('A'));
    expect(created?.composition).toMatchObject({
      payload: payload('A'),
      queries: [expect.objectContaining({ id: queryOne })],
    });
    expect(page.currentDraftVersionId).toBe('99999999-9999-4999-8999-999999999999');
    expect(page.publishedVersionId).toBe(publishedVersionId);
    expect(pageExtensions.synchronizeComposition).toHaveBeenCalledWith(
      pageId,
      workspaceId,
      expect.objectContaining({ queries: [expect.objectContaining({ id: queryOne })] }),
    );
  });

  it('normalizes a legacy target from its own payload with no current composition leakage', async () => {
    const { service, getCreated } = setup(false);

    await service.restoreVersion(
      pageId,
      1,
      { expectedCurrentVersionNumber: 2 },
      workspaceId,
    );
    const created = getCreated();

    expect(created?.payload).toEqual(payload('A'));
    expect(created?.composition).toMatchObject({ payload: payload('A'), queries: [] });
    expect(created?.composition).not.toMatchObject({
      queries: [expect.objectContaining({ id: queryTwo })],
    });
  });
});
