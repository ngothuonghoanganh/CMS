import { describe, expect, it, vi } from 'vitest';

import { PageService } from './page.service';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const siteId = '22222222-2222-4222-8222-222222222222';
const pageId = '33333333-3333-4333-8333-333333333333';
const queryA = '44444444-4444-4444-8444-444444444444';
const queryB = '55555555-5555-4555-8555-555555555555';
const collectionId = '66666666-6666-4666-8666-666666666666';

function payload(queryId: string) {
  return {
    version: 7 as const,
    metadata: { documentTitle: 'Page' },
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
              id: 'collection-list-1',
              type: 'collection-list' as const,
              props: { queryId, emptyMessage: 'No items' },
              children: [
                {
                  id: 'collection-item-1',
                  type: 'collection-item' as const,
                  props: {},
                  children: [],
                },
              ],
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

function setupPageService() {
  const page = {
    _id: { toString: () => pageId },
    workspaceId,
    siteId,
    currentDraftVersionId: 'version-1',
  };
  const previousPayload = payload(queryA);
  const currentVersion = {
    _id: 'version-1',
    workspaceId,
    siteId,
    landingPageId: pageId,
    versionNumber: 1,
    payload: previousPayload,
    composition: composition(previousPayload, queryA),
  };
  const pageModel = {
    findOne: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(page) })),
  };
  const versionModel = {
    findOne: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(currentVersion) })),
  };
  const service = Object.create(PageService.prototype) as PageService;
  const state = service as unknown as {
    pageModel: typeof pageModel;
    versionModel: typeof versionModel;
  };
  state.pageModel = pageModel;
  state.versionModel = versionModel;
  return { service, pageModel, versionModel };
}

describe('PageService design authorization', () => {
  it('rejects a collection-list query source mutation for content-only saves', async () => {
    const { service } = setupPageService();
    const nextPayload = payload(queryB);

    await expect(
      service.createVersion(
        pageId,
        {
          expectedVersionNumber: 1,
          payload: nextPayload,
          composition: composition(nextPayload, queryB),
        },
        workspaceId,
        false,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PAGE_DESIGN_PERMISSION_REQUIRED' }),
    });
  });

  it('does not allow content-only callers to create arbitrary page documents', async () => {
    const { service } = setupPageService();

    await expect(
      service.create(
        siteId,
        {
          name: 'Designed page',
          path: '/designed-page',
          payload: payload(queryA),
        },
        workspaceId,
        false,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PAGE_DESIGN_PERMISSION_REQUIRED' }),
    });
  });
});
