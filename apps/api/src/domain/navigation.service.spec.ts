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
    items: [],
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

describe('NavigationService menu data semantics', () => {
  it('resolves menu items to hrefs using the selected page version', async () => {
    const service = Object.create(NavigationService.prototype) as NavigationService;
    const state = internals(service);
    state.requireSite = vi.fn().mockResolvedValue({ homePageId });
    state.navigationModel = {
      find: vi.fn().mockReturnValue(cursor([navigationRecord({ items: [draftTarget] })])),
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
      find: vi.fn().mockReturnValue(cursor([navigationRecord({ items: [section] })])),
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

  it('exposes the canonical menu items contract without draft/published fields', () => {
    const service = Object.create(NavigationService.prototype) as NavigationService;
    const state = internals(service);
    const contract = state.toContract(navigationRecord({ items: [draftTarget] })) as {
      items: NavigationItem[];
      draftItems?: unknown;
      publishedItems?: unknown;
    };

    expect(contract.items).toEqual([draftTarget]);
    expect('draftItems' in contract).toBe(false);
    expect('publishedItems' in contract).toBe(false);
  });

  it('blocks deleting a page that a menu still references', async () => {
    const service = Object.create(NavigationService.prototype) as NavigationService;
    const state = internals(service);
    state.navigationModel = {
      find: vi.fn().mockReturnValue(cursor([navigationRecord({ items: [draftTarget] })])),
      findOne: vi.fn(),
    };

    await expect(
      service.assertPageCanBeDeleted('site-1', campaignPageId, 'workspace-1'),
    ).rejects.toThrow('Remove this page from site navigation before deleting it');
  });
});
