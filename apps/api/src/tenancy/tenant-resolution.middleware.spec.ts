import { describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';

import { TenantResolutionMiddleware } from './tenant-resolution.middleware';
import type { TenantContext } from './tenant-context';
import type { TenantResolver } from './tenant-resolver';

describe('tenant resolution middleware', () => {
  it('uses the master site registry before considering the API transport hostname', async () => {
    const scope = {
      id: 'tenant-1',
      slug: 'tenant-one',
      name: 'Tenant One',
      status: 'active' as const,
      databaseKey: 'mongo:tenant-one',
      databaseName: 'tenant-one',
      schemaVersion: 1,
    };
    const resolveByPublicSiteSlug = vi.fn().mockResolvedValue(scope);
    const resolveByHostname = vi.fn();
    const ensureConnection = vi.fn().mockResolvedValue(undefined);
    const resolver = {
      resolveByPublicSiteSlug,
      resolveByHostname,
      ensureConnection,
    } as unknown as TenantResolver;
    const run = vi.fn((_scope: typeof scope, callback: () => void) => callback());
    const context = { run } as unknown as TenantContext;
    const middleware = new TenantResolutionMiddleware(resolver, context);
    const request = {
      path: '/api/v1/public/sites/demo/resolve',
      query: { hostname: 'api.example.com' },
      body: {},
      header: () => undefined,
      hostname: 'api.example.com',
    } as unknown as Request;
    const next = vi.fn();

    await middleware.use(request, {} as never, next);

    expect(resolveByPublicSiteSlug).toHaveBeenCalledWith('demo');
    expect(resolveByHostname).not.toHaveBeenCalled();
    expect(ensureConnection).toHaveBeenCalledWith(scope);
    expect(run).toHaveBeenCalledWith(scope, expect.any(Function));
    expect(next).toHaveBeenCalledOnce();
  });
});
