import { describe, expect, it, vi } from 'vitest';
import { createDefaultSiteDesignSystem } from '@payload/contracts';

import { PageService } from './page.service';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const siteId = '22222222-2222-4222-8222-222222222222';
const pageId = '33333333-3333-4333-8333-333333333333';

const payload = {
  version: 7 as const,
  metadata: { documentTitle: 'First publication' },
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
            props: { text: 'Hello public' },
            children: [],
          },
        ],
      },
    ],
  },
};

const composition = {
  pageId,
  payload,
  attachments: [],
  layoutAttachments: [],
  bindings: [],
  actions: [],
  resources: [],
  queries: [],
};

describe('PageService publish readiness', () => {
  it('summarizes a non-empty never-published page against an empty baseline', async () => {
    const page = {
      _id: { toString: () => pageId },
      workspaceId,
      siteId,
      path: '/first-publication',
      kind: 'standard',
      currentDraftVersionId: 'version-1',
    };
    const version = {
      _id: 'version-1',
      workspaceId,
      siteId,
      landingPageId: pageId,
      versionNumber: 1,
      payload,
      composition,
    };
    const pageModel = {
      findOne: vi.fn((filter: Record<string, unknown>) => ({
        select: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(filter._id === pageId ? page : null),
      })),
    };
    const versionModel = {
      findOne: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(version) })),
    };
    const service = Object.create(PageService.prototype) as PageService;
    const state = service as unknown as {
      pageModel: typeof pageModel;
      versionModel: typeof versionModel;
      reusables: Record<string, ReturnType<typeof vi.fn>>;
      sites: Record<string, ReturnType<typeof vi.fn>>;
      workflows: Record<string, ReturnType<typeof vi.fn>>;
      pageExtensions: Record<string, ReturnType<typeof vi.fn>>;
      collections: Record<string, ReturnType<typeof vi.fn>>;
    };
    state.pageModel = pageModel;
    state.versionModel = versionModel;
    state.reusables = {
      assertDependenciesAvailable: vi.fn(),
      assertDesignTokenDependenciesAvailable: vi.fn(),
    };
    state.sites = {
      getDesignSystem: vi.fn().mockResolvedValue({
        draft: createDefaultSiteDesignSystem(),
      }),
    };
    state.workflows = { validatePagePublishDependencies: vi.fn() };
    state.pageExtensions = { validateBeforePublish: vi.fn() };
    state.collections = { validateComposition: vi.fn() };

    const readiness = await service.getPublishReadiness(pageId, workspaceId);

    expect(readiness.ready).toBe(true);
    expect(readiness.summary).toMatchObject({
      componentsAdded: 2,
      contentFieldChanges: 0,
    });
    expect(readiness.summary).not.toEqual({
      contentFieldChanges: 0,
      designValueChanges: 0,
      componentsAdded: 0,
      componentsRemoved: 0,
      componentsMoved: 0,
      componentsReordered: 0,
      componentsTypeChanged: 0,
    });
  });
});
