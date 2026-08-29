import { describe, expect, it, vi } from 'vitest';

import { PublicPageResolver } from './public-page.resolver';

type TestResolver = {
  siteModel: { find: () => ReturnType<typeof query> };
  pageModel: { findOne: (filter: Record<string, string>) => ReturnType<typeof query> };
  findPublishedVersion: (page: unknown, site: unknown) => Promise<unknown>;
  toPublicContract: (site: unknown, page: unknown, version: unknown) => Promise<unknown>;
  resolveByPath: (siteSlug: string, path: string) => Promise<unknown>;
};

function query<T>(value: T) {
  return {
    exec: async () => value,
    limit() {
      return this;
    },
    sort() {
      return this;
    },
  };
}

describe('public page resolver', () => {
  it('resolves the site homepage reference without a delivery-time repair write', async () => {
    const site = {
      _id: { toString: () => 'site-1' },
      slug: 'demo',
      workspaceId: 'workspace-1',
      homePageId: 'page-about',
    };
    const page = {
      _id: { toString: () => 'page-about' },
      siteId: 'site-1',
      workspaceId: 'workspace-1',
      publishedVersionId: 'version-1',
    };
    const pageFindOne = vi.fn().mockReturnValue(query(page));
    const service = Object.create(PublicPageResolver.prototype) as TestResolver;
    service.siteModel = { find: vi.fn().mockReturnValue(query([site])) };
    service.pageModel = { findOne: pageFindOne };
    service.findPublishedVersion = vi.fn().mockResolvedValue({});
    service.toPublicContract = vi.fn().mockResolvedValue({ page });

    await service.resolveByPath('demo', '/');

    expect(pageFindOne).toHaveBeenCalledWith({
      _id: 'page-about',
      siteId: 'site-1',
      workspaceId: 'workspace-1',
    });
    expect((site as { save?: unknown }).save).toBeUndefined();
  });
});
