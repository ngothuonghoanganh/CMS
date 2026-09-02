import { describe, expect, it, vi } from 'vitest';

import { SiteService } from './site.service';
import type { SiteGlobals } from '@payload/contracts';

type Cursor<T> = {
  exec: () => Promise<T>;
};

type ServiceInternals = {
  siteModel: { findOne: (filter: unknown) => Cursor<unknown> };
};

function cursor<T>(value: T): Cursor<T> {
  return { exec: async () => value };
}

function createRecord(globals: { draft?: SiteGlobals; published?: SiteGlobals }) {
  return {
    _id: { toString: () => 'site-1' },
    workspaceId: 'workspace-1',
    status: 'published',
    ...(globals.draft ? { globalsDraft: globals.draft } : {}),
    ...(globals.published ? { publishedGlobals: globals.published } : {}),
    save: vi.fn().mockResolvedValue(undefined),
  };
}

function setup(record: ReturnType<typeof createRecord>) {
  const service = Object.create(SiteService.prototype) as SiteService;
  const state = service as unknown as ServiceInternals;
  state.siteModel = {
    findOne: vi.fn().mockReturnValue(cursor(record)),
  };
  return { service, state };
}

describe('SiteService globals (site-wide data only)', () => {
  it('returns social links without exposing header/footer ownership', async () => {
    const socialLinks = [
      { id: 'twitter', platform: 'x' as const, label: 'X', href: 'https://x.com/acme' },
    ];
    const record = createRecord({
      published: { version: 1, socialLinks },
    });
    const { service } = setup(record);

    const response = await service.getGlobals('workspace-1', 'site-1');

    expect(response.draft).toEqual({ version: 1 });
    expect(response.published).toEqual({ version: 1, socialLinks });
    expect('header' in response.draft).toBe(false);
    expect('footer' in response.draft).toBe(false);
  });

  it('persists an explicit social links draft', async () => {
    const socialLinks = [
      {
        id: 'github',
        platform: 'custom' as const,
        label: 'GitHub',
        href: 'https://github.com/acme',
      },
    ];
    const record = createRecord({});
    const { service } = setup(record);

    await service.updateGlobals('workspace-1', 'site-1', { version: 1, socialLinks });

    expect(record.globalsDraft).toEqual({ version: 1, socialLinks });
  });
});
