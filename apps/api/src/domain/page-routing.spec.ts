import { describe, expect, it, vi } from 'vitest';

import { PageService } from './page.service';

type TestPageService = {
  requirePageDocument: (pageId: string, workspaceId: string) => Promise<unknown>;
  requireSite: (siteId: string, workspaceId: string) => Promise<unknown>;
  toPageContract: (record: unknown) => unknown;
  setHomepage: (pageId: string, workspaceId: string) => Promise<unknown>;
};

describe('page routing ownership', () => {
  it('switches the homepage reference without rewriting Page.path', async () => {
    const page = {
      _id: { toString: () => 'page-about' },
      siteId: 'site-1',
      path: '/about',
    };
    const site = {
      homePageId: 'page-home',
      save: vi.fn().mockResolvedValue(undefined),
    };
    const service = Object.create(PageService.prototype) as TestPageService;
    service.requirePageDocument = vi.fn().mockResolvedValue(page);
    service.requireSite = vi.fn().mockResolvedValue(site);
    service.toPageContract = vi
      .fn()
      .mockReturnValue({ id: 'page-about', path: '/about' });

    await service.setHomepage('page-about', 'workspace-1');

    expect(site.homePageId).toBe('page-about');
    expect(site.save).toHaveBeenCalledOnce();
    expect(page.path).toBe('/about');
  });
});
