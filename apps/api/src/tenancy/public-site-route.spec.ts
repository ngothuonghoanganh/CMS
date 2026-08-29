import { describe, expect, it, vi } from 'vitest';

import { TenantResolver } from './tenant-resolver';

function query<T>(value: T) {
  return { exec: async () => value };
}

describe('public site route registry', () => {
  it('upserts a tenant/site route while preserving the globally unique slug key', async () => {
    const findOne = vi.fn().mockReturnValue(query(null));
    const findOneAndUpdate = vi
      .fn()
      .mockReturnValue(query({ _id: 'route-1', siteSlug: 'marketing' }));
    const resolver = Object.create(TenantResolver.prototype) as unknown as {
      publicSiteRouteModel: {
        findOne: typeof findOne;
        findOneAndUpdate: typeof findOneAndUpdate;
      };
      registerPublicSiteRoute: TenantResolver['registerPublicSiteRoute'];
    };
    resolver.publicSiteRouteModel = { findOne, findOneAndUpdate };

    await resolver.registerPublicSiteRoute({
      siteSlug: ' Marketing ',
      tenantId: 'tenant-1',
      tenantSlug: 'Tenant-One',
      databaseKey: 'mongo:tenant-one',
      workspaceId: 'workspace-1',
      siteId: 'site-1',
    });

    expect(findOne).toHaveBeenCalledWith({
      siteSlug: 'marketing',
    });
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', siteId: 'site-1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          siteSlug: 'marketing',
          tenantSlug: 'tenant-one',
          status: 'active',
        }),
      }),
      expect.objectContaining({ upsert: true, new: true }),
    );
  });
});
