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

describe('SiteService core creation boundary', () => {
  it('creates a site without a billing quota and preserves bootstrap invariants', async () => {
    const service = Object.create(SiteService.prototype) as SiteService;
    const record = {
      _id: { toString: () => 'site-1' },
      workspaceId: 'workspace-1',
      name: 'Landing page',
      slug: 'landing-page',
      deleteOne: vi.fn().mockResolvedValue(undefined),
    };
    const siteModel = { create: vi.fn().mockResolvedValue(record) };
    const internals = service as unknown as Record<string, unknown>;
    internals.siteModel = siteModel;
    internals.requireWorkspace = vi.fn().mockResolvedValue(undefined);
    internals.ensureHomePage = vi.fn().mockResolvedValue({ id: 'home-page' });
    internals.registerPublicRoute = vi.fn().mockResolvedValue(undefined);
    internals.toContract = vi.fn().mockResolvedValue({ id: 'site-1' });

    const result = await service.create('workspace-1', {
      name: 'Landing page',
      slug: 'Landing Page',
    });

    expect(result).toEqual({ id: 'site-1' });
    expect(siteModel.create).toHaveBeenCalledWith({
      _id: expect.any(String),
      workspaceId: 'workspace-1',
      name: 'Landing page',
      slug: 'landing-page',
    });
    expect(internals.ensureHomePage).toHaveBeenCalledWith(record);
    expect(internals.registerPublicRoute).toHaveBeenCalledWith(record);
  });

  it('removes the site and bootstrap children when public route setup fails', async () => {
    const service = Object.create(SiteService.prototype) as SiteService;
    const record = {
      _id: { toString: () => 'site-1' },
      deleteOne: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(undefined),
      }),
    };
    const versionDelete = { exec: vi.fn().mockResolvedValue(undefined) };
    const pageDelete = { exec: vi.fn().mockResolvedValue(undefined) };
    const internals = service as unknown as Record<string, unknown>;
    internals.siteModel = { create: vi.fn().mockResolvedValue(record) };
    internals.pageModel = { deleteMany: vi.fn().mockReturnValue(pageDelete) };
    internals.versionModel = { deleteMany: vi.fn().mockReturnValue(versionDelete) };
    internals.requireWorkspace = vi.fn().mockResolvedValue(undefined);
    internals.ensureHomePage = vi.fn().mockResolvedValue(undefined);
    internals.registerPublicRoute = vi
      .fn()
      .mockRejectedValue(new Error('route registration failed'));

    await expect(
      service.create('workspace-1', { name: 'Landing page', slug: 'landing-page' }),
    ).rejects.toThrow('route registration failed');
    expect(versionDelete.exec).toHaveBeenCalledOnce();
    expect(pageDelete.exec).toHaveBeenCalledOnce();
    expect(record.deleteOne).toHaveBeenCalledOnce();
  });
});
