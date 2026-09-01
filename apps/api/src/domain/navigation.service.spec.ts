import { describe, expect, it, vi } from 'vitest';
import type { NavigationItem } from '@payload/contracts';

import { NavigationService } from './navigation.service';
import type { NavigationDocument } from '../persistence/schemas/navigation.schema';

const homePageId = '00000000-0000-4000-8000-000000000001';
const campaignPageId = '00000000-0000-4000-8000-000000000002';

type Cursor<T> = {
  sort: () => Cursor<T>;
  exec: () => Promise<T>;
};

type ModelStub = {
  find: (filter: unknown) => Cursor<unknown[]>;
  findOne: (filter: unknown) => Cursor<unknown>;
};

type ServiceInternals = {
  requireSite: (siteId: string, workspaceId: string) => Promise<unknown>;
  navigationModel: ModelStub;
  pageModel: ModelStub;
  versionModel: ModelStub;
  validateItems: (...args: unknown[]) => Promise<void>;
  validateBeforeSitePublish: (siteId: string, workspaceId: string) => Promise<void>;
  toContract: (record: NavigationDocument) => unknown;
};

function cursor<T>(value: T): Cursor<T> {
  return { sort: () => cursor(value), exec: async () => value };
}

function internals(service: NavigationService): ServiceInternals {
  return service as unknown as ServiceInternals;
}

function page(id: string, published: boolean) {
  return {
    _id: { toString: () => id },
    name: id,
    path: id === homePageId ? '/' : `/${id}`,
    publishedVersionId: published ? `${id}-published` : undefined,
    currentDraftVersionId: `${id}-draft`,
  };
}

function navigationRecord(
  items: Partial<NavigationDocument> & { key?: string },
): NavigationDocument {
  return {
    _id: { toString: () => '00000000-0000-4000-8000-000000000010' },
    siteId: '00000000-0000-4000-8000-000000000011',
    workspaceId: 'workspace-1',
    name: 'Main navigation',
    key: items.key ?? 'main',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    save: vi.fn().mockResolvedValue(undefined),
    ...items,
  } as unknown as NavigationDocument;
}

const draftTarget: NavigationItem = {
  id: '00000000-0000-4000-8000-000000000003',
  label: 'Campaign',
  type: 'page',
  pageId: campaignPageId,
};

describe('NavigationService publishing semantics', () => {
  it('allows a draft navigation target during site validation', async () => {
    const service = Object.create(NavigationService.prototype) as NavigationService;
    const state = internals(service);
    state.requireSite = vi.fn().mockResolvedValue({ homePageId: homePageId });
    state.pageModel = {
      find: vi
        .fn()
        .mockReturnValue(cursor([page(homePageId, true), page(campaignPageId, false)])),
      findOne: vi.fn().mockReturnValue(cursor(null)),
    };
    state.navigationModel = {
      find: vi
        .fn()
        .mockReturnValue(cursor([navigationRecord({ draftItems: [draftTarget] })])),
      findOne: vi.fn(),
    };
    const validateItems = vi.fn().mockResolvedValue(undefined);
    state.validateItems = validateItems;

    await service.validateBeforeSitePublish('site-1', 'workspace-1');

    expect(validateItems).toHaveBeenCalledOnce();
    expect(validateItems.mock.calls[0]?.[2]).toEqual([draftTarget]);
  });

  it('still rejects a missing or cross-site target during site validation', async () => {
    const service = Object.create(NavigationService.prototype) as NavigationService;
    const state = internals(service);
    state.requireSite = vi.fn().mockResolvedValue({ homePageId });
    state.pageModel = {
      find: vi.fn().mockReturnValue(cursor([page(homePageId, true)])),
      findOne: vi.fn().mockReturnValue(cursor(null)),
    };
    state.navigationModel = {
      find: vi.fn().mockReturnValue(
        cursor([
          navigationRecord({
            draftItems: [
              {
                ...draftTarget,
                pageId: '00000000-0000-4000-8000-000000000099',
              },
            ],
          }),
        ]),
      ),
      findOne: vi.fn(),
    };

    await expect(
      service.validateBeforeSitePublish('site-1', 'workspace-1'),
    ).rejects.toThrow('Navigation contains an invalid internal target');
  });

  it('uses draft targets for preview and hides unavailable targets publicly', async () => {
    const service = Object.create(NavigationService.prototype) as NavigationService;
    const state = internals(service);
    state.requireSite = vi.fn().mockResolvedValue({ homePageId: homePageId });
    state.navigationModel = {
      find: vi.fn().mockReturnValue(
        cursor([
          navigationRecord({
            draftItems: [draftTarget],
            publishedItems: [draftTarget],
          }),
        ]),
      ),
      findOne: vi.fn(),
    };
    state.pageModel = {
      find: vi.fn(),
      findOne: vi.fn().mockReturnValue(cursor(page(campaignPageId, false))),
    };

    const preview = await service.resolveForSite('site-1', 'workspace-1', {
      mode: 'draft',
    });
    const publicNavigation = await service.resolveForSite('site-1', 'workspace-1', {
      mode: 'published',
    });

    expect(preview?.main?.map((item) => item.label)).toEqual(['Campaign']);
    expect(publicNavigation?.main).toEqual([]);
  });

  it('snapshots draft structure and reports draft target warnings', async () => {
    const service = Object.create(NavigationService.prototype) as NavigationService;
    const state = internals(service);
    const record = navigationRecord({ draftItems: [draftTarget] });
    state.validateItems = vi.fn().mockResolvedValue(undefined);
    state.validateBeforeSitePublish = vi.fn().mockResolvedValue(undefined);
    state.pageModel = {
      find: vi
        .fn()
        .mockReturnValue(cursor([page(homePageId, true), page(campaignPageId, false)])),
      findOne: vi.fn(),
    };
    state.navigationModel = {
      find: vi.fn().mockReturnValue(cursor([record])),
      findOne: vi.fn(),
    };

    const summary = await service.publishForSite('site-1', 'workspace-1');

    expect(record.publishedItems).toEqual([draftTarget]);
    expect(record.save).toHaveBeenCalledOnce();
    expect(summary.warnings).toHaveLength(1);
    expect(summary.warnings[0]).toMatchObject({
      code: 'NAVIGATION_TARGET_DRAFT',
      label: 'Campaign',
      pageId: campaignPageId,
    });
  });

  it('updates only the draft structure after a navigation has been published', async () => {
    const service = Object.create(NavigationService.prototype) as NavigationService;
    const state = internals(service);
    const publishedItems: NavigationItem[] = [
      {
        id: '00000000-0000-4000-8000-000000000005',
        label: 'Home',
        type: 'page',
        pageId: homePageId,
      },
    ];
    const record = navigationRecord({
      draftItems: publishedItems,
      publishedItems,
    });
    state.navigationModel = {
      find: vi.fn(),
      findOne: vi.fn().mockReturnValue(cursor(record)),
    };
    state.pageModel = { find: vi.fn(), findOne: vi.fn() };
    state.validateItems = vi.fn().mockResolvedValue(undefined);

    await service.update(
      'site-1',
      '00000000-0000-4000-8000-000000000010',
      { items: [draftTarget] },
      'workspace-1',
    );

    expect(record.draftItems).toEqual([draftTarget]);
    expect(record.publishedItems).toEqual(publishedItems);
  });

  it('hides a section whose anchor is absent from the published payload', async () => {
    const service = Object.create(NavigationService.prototype) as NavigationService;
    const state = internals(service);
    const section: NavigationItem = {
      id: '00000000-0000-4000-8000-000000000004',
      label: 'Pricing',
      type: 'section',
      pageId: campaignPageId,
      anchorId: 'pricing',
    };
    state.requireSite = vi.fn().mockResolvedValue({ homePageId });
    state.navigationModel = {
      find: vi
        .fn()
        .mockReturnValue(cursor([navigationRecord({ publishedItems: [section] })])),
      findOne: vi.fn(),
    };
    state.pageModel = {
      find: vi.fn(),
      findOne: vi.fn().mockReturnValue(
        cursor({
          ...page(campaignPageId, true),
          currentDraftVersionId: 'draft-version',
          publishedVersionId: 'published-version',
          anchors: ['pricing'],
        }),
      ),
    };
    state.versionModel = {
      find: vi.fn(),
      findOne: vi.fn().mockReturnValue(
        cursor({
          payload: {
            version: 1,
            metadata: { documentTitle: 'Published' },
            root: { id: 'root', type: 'root', props: {}, children: [] },
          },
        }),
      ),
    };

    const publicNavigation = await service.resolveForSite('site-1', 'workspace-1', {
      mode: 'published',
    });

    expect(publicNavigation?.main).toEqual([]);
  });

  it('normalizes legacy items to both draft and published structures', () => {
    const service = Object.create(NavigationService.prototype) as NavigationService;
    const state = internals(service);
    const legacyItems = [draftTarget];
    const contract = state.toContract(navigationRecord({ items: legacyItems })) as {
      items: NavigationItem[];
      draftItems?: NavigationItem[];
      publishedItems?: NavigationItem[];
      hasUnpublishedChanges?: boolean;
    };

    expect(contract.items).toEqual(legacyItems);
    expect(contract.draftItems).toEqual(legacyItems);
    expect(contract.publishedItems).toEqual(legacyItems);
    expect(contract.hasUnpublishedChanges).toBe(false);
  });
});
