import { describe, expect, it, vi } from 'vitest';

import type { NavigationService } from '../modules/navigation/navigation.service';
import { PageNavigationAdapter } from './page-navigation.adapter';

describe('PageNavigationAdapter', () => {
  it('forwards only navigation capabilities required by page workflows', async () => {
    const navigation = {
      validateInlineNavigationDocument: vi.fn().mockResolvedValue(undefined),
      assertPageCanBeDeleted: vi.fn().mockResolvedValue(undefined),
      resolveForSite: vi.fn().mockResolvedValue({ main: [] }),
      resolvePagePaths: vi.fn().mockResolvedValue({}),
    } as unknown as NavigationService;
    const adapter = new PageNavigationAdapter(navigation);

    await adapter.validateInlineNavigationDocument(
      { type: 'navigation-view' },
      'workspace-1',
      'site-1',
    );
    await adapter.assertPageCanBeDeleted('site-1', 'page-1', 'workspace-1');
    await expect(
      adapter.resolveForSite('site-1', 'workspace-1', { mode: 'published' }),
    ).resolves.toEqual({ main: [] });
    await expect(
      adapter.resolvePagePaths(
        'site-1',
        'workspace-1',
        ['page-1'],
        'page-home',
        'published',
      ),
    ).resolves.toEqual({});

    expect(navigation.validateInlineNavigationDocument).toHaveBeenCalledWith(
      { type: 'navigation-view' },
      'workspace-1',
      'site-1',
    );
    expect(navigation.assertPageCanBeDeleted).toHaveBeenCalledWith(
      'site-1',
      'page-1',
      'workspace-1',
    );
    expect(navigation.resolveForSite).toHaveBeenCalledWith('site-1', 'workspace-1', {
      mode: 'published',
    });
    expect(navigation.resolvePagePaths).toHaveBeenCalledWith(
      'site-1',
      'workspace-1',
      ['page-1'],
      'page-home',
      'published',
    );
  });
});
