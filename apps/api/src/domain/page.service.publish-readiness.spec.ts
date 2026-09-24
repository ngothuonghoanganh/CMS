import { describe, expect, it, vi } from 'vitest';
import {
  createDefaultSiteDesignSystem,
  OpenCompositionPayloadSchema,
} from '@payload/contracts';

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
      navigation: Record<string, ReturnType<typeof vi.fn>>;
      sites: Record<string, ReturnType<typeof vi.fn>>;
      pagePublishCompatibility: Record<string, ReturnType<typeof vi.fn>>;
      pageExtensions: Record<string, ReturnType<typeof vi.fn>>;
      collections: Record<string, ReturnType<typeof vi.fn>>;
    };
    state.pageModel = pageModel;
    state.versionModel = versionModel;
    state.reusables = {
      assertDependenciesAvailable: vi.fn(),
      assertDesignTokenDependenciesAvailable: vi.fn(),
    };
    state.navigation = {
      validateInlineNavigationDocument: vi.fn(),
    };
    state.sites = {
      getDesignSystem: vi.fn().mockResolvedValue({
        draft: createDefaultSiteDesignSystem(),
      }),
    };
    state.pagePublishCompatibility = { validateBeforePublish: vi.fn() };
    state.pageExtensions = { validateBeforePublish: vi.fn() };
    state.collections = { validateComposition: vi.fn() };

    const readiness = await service.getPublishReadiness(pageId, workspaceId);

    expect(readiness.ready).toBe(true);
    expect(state.pagePublishCompatibility.validateBeforePublish).toHaveBeenCalledWith(
      pageId,
      workspaceId,
    );
    expect(state.navigation.validateInlineNavigationDocument).toHaveBeenCalledWith(
      payload,
      workspaceId,
      siteId,
    );
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

  it('reports invalid inline navigation as a blocking readiness issue without writes', async () => {
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
      findOneAndUpdate: vi.fn(),
    };
    const versionModel = {
      findOne: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(version) })),
      create: vi.fn(),
      save: vi.fn(),
    };
    const service = Object.create(PageService.prototype) as PageService;
    const state = service as unknown as Record<string, unknown>;
    state.pageModel = pageModel;
    state.versionModel = versionModel;
    state.navigation = {
      validateInlineNavigationDocument: vi
        .fn()
        .mockRejectedValue(new Error('invalid inline navigation')),
    };
    state.reusables = {
      assertDependenciesAvailable: vi.fn(),
      assertDesignTokenDependenciesAvailable: vi.fn(),
    };
    state.sites = {
      getDesignSystem: vi.fn().mockResolvedValue({
        draft: createDefaultSiteDesignSystem(),
      }),
    };
    state.pagePublishCompatibility = { validateBeforePublish: vi.fn() };
    state.pageExtensions = { validateBeforePublish: vi.fn() };
    state.collections = { validateComposition: vi.fn() };

    const readiness = await service.getPublishReadiness(pageId, workspaceId);

    expect(readiness.ready).toBe(false);
    expect(readiness.blockingIssues).toEqual([
      expect.objectContaining({ code: 'UNKNOWN', message: 'invalid inline navigation' }),
    ]);
    expect(pageModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(versionModel.create).not.toHaveBeenCalled();
  });

  it('reports the same workflow compatibility failure as a publish blocker', async () => {
    const page = {
      _id: { toString: () => pageId },
      workspaceId,
      siteId,
      path: '/workflow-blocked',
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
    const service = Object.create(PageService.prototype) as PageService;
    const state = service as unknown as Record<string, unknown>;
    state.pageModel = {
      findOne: vi.fn((filter: Record<string, unknown>) => ({
        select: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(filter._id === pageId ? page : null),
      })),
    };
    state.versionModel = {
      findOne: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(version) })),
    };
    state.navigation = { validateInlineNavigationDocument: vi.fn() };
    state.reusables = {
      assertDependenciesAvailable: vi.fn(),
      assertDesignTokenDependenciesAvailable: vi.fn(),
    };
    state.sites = {
      getDesignSystem: vi.fn().mockResolvedValue({
        draft: createDefaultSiteDesignSystem(),
      }),
    };
    state.pagePublishCompatibility = {
      validateBeforePublish: vi.fn().mockRejectedValue(new Error('workflow blocked')),
    };
    state.pageExtensions = { validateBeforePublish: vi.fn() };
    state.collections = { validateComposition: vi.fn() };

    const readiness = await service.getPublishReadiness(pageId, workspaceId);

    expect(readiness.ready).toBe(false);
    expect(readiness.blockingIssues).toEqual([
      expect.objectContaining({ code: 'UNKNOWN', message: 'workflow blocked' }),
    ]);
    expect(state.pagePublishCompatibility.validateBeforePublish).toHaveBeenCalledWith(
      pageId,
      workspaceId,
    );
  });

  it('keeps readiness structured for a never-published Open Composition draft', async () => {
    const openPayload = OpenCompositionPayloadSchema.parse({
      version: 8,
      metadata: { documentTitle: 'Open Composition page' },
      root: {
        id: 'root',
        type: 'root',
        props: {},
        children: [
          {
            id: 'section-1',
            type: 'section',
            props: {},
            children: [
              {
                id: 'form-1',
                type: 'form',
                props: { formKey: 'contact' },
                children: [],
              },
            ],
          },
        ],
      },
      behaviors: [
        {
          id: 'form-submit',
          kind: 'action',
          nodeId: 'form-1',
          event: 'submit',
          action: 'submit-form',
          targetNodeId: 'form-1',
        },
      ],
    });
    const page = {
      _id: { toString: () => pageId },
      workspaceId,
      siteId,
      path: '/open-composition',
      kind: 'standard',
      currentDraftVersionId: 'version-1',
    };
    const version = {
      _id: 'version-1',
      workspaceId,
      siteId,
      landingPageId: pageId,
      versionNumber: 1,
      payload: openPayload,
      composition: { ...composition, payload: openPayload },
    };
    const service = Object.create(PageService.prototype) as PageService;
    const state = service as unknown as Record<string, unknown>;
    state.pageModel = {
      findOne: vi.fn((filter: Record<string, unknown>) => ({
        select: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(filter._id === pageId ? page : null),
      })),
    };
    state.versionModel = {
      findOne: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(version) })),
    };
    state.navigation = { validateInlineNavigationDocument: vi.fn() };
    state.reusables = {
      assertDependenciesAvailable: vi.fn(),
      assertDesignTokenDependenciesAvailable: vi.fn(),
    };
    state.sites = {
      getDesignSystem: vi.fn().mockResolvedValue({
        draft: createDefaultSiteDesignSystem(),
      }),
    };
    state.pagePublishCompatibility = { validateBeforePublish: vi.fn() };
    state.pageExtensions = { validateBeforePublish: vi.fn() };
    state.collections = { validateComposition: vi.fn() };

    const readiness = await service.getPublishReadiness(pageId, workspaceId);

    expect(readiness.ready).toBe(true);
    expect(readiness.blockingIssues).toEqual([]);
    expect(readiness.summary.componentsAdded).toBe(2);
  });
});
