import { describe, expect, it, vi } from 'vitest';

import type { LayoutExtensionService } from './layout-extension.service';
import { PageLayoutAdapter } from './page-layout.adapter';

describe('PageLayoutAdapter', () => {
  it('forwards only layout capabilities required by page workflows', async () => {
    const resource = { id: 'layout-1' };
    const composition = { header: { slot: 'top', document: {} } };
    const layouts = {
      get: vi.fn().mockResolvedValue(resource),
      resolveComposition: vi.fn().mockResolvedValue(composition),
    } as unknown as LayoutExtensionService;
    const adapter = new PageLayoutAdapter(layouts);
    const attachments = [
      {
        id: 'attachment-1',
        type: 'header' as const,
        resourceId: 'layout-1',
        slot: 'page.header.top' as const,
        enabled: true,
      },
    ];

    await expect(
      adapter.get('site-1', 'workspace-1', 'header', 'layout-1'),
    ).resolves.toEqual(resource);
    await expect(
      adapter.resolveComposition(attachments, 'published', {
        workspaceId: 'workspace-1',
        siteId: 'site-1',
      }),
    ).resolves.toEqual(composition);

    expect(layouts.get).toHaveBeenCalledWith(
      'site-1',
      'workspace-1',
      'header',
      'layout-1',
    );
    expect(layouts.resolveComposition).toHaveBeenCalledWith(attachments, 'published', {
      workspaceId: 'workspace-1',
      siteId: 'site-1',
    });
  });
});
