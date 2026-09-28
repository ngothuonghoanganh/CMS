import { describe, expect, it, vi } from 'vitest';

import { SiteNavigationAdapter } from './site-navigation.adapter';

describe('SiteNavigationAdapter', () => {
  it('reads only the navigation references needed by the site manifest', async () => {
    const exec = vi.fn().mockResolvedValue([
      { _id: { toString: () => 'nav-main' }, key: 'main' },
      { _id: { toString: () => 'nav-footer' }, key: 'footer' },
    ]);
    const navigationModel = {
      find: vi.fn().mockReturnValue({ exec }),
    };
    const adapter = new SiteNavigationAdapter(navigationModel as never);

    await expect(adapter.listReferences('workspace-1', 'site-1')).resolves.toEqual([
      { id: 'nav-main', key: 'main' },
      { id: 'nav-footer', key: 'footer' },
    ]);
    expect(navigationModel.find).toHaveBeenCalledWith({
      siteId: 'site-1',
      workspaceId: 'workspace-1',
    });
    expect(exec).toHaveBeenCalledOnce();
  });
});
