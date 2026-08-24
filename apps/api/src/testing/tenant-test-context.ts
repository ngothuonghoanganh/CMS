import type { TestingModule } from '@nestjs/testing';

import { env } from '../config/env';
import { TenantContext } from '../tenancy/tenant-context';
import { TenantResolver } from '../tenancy/tenant-resolver';

/** Bind direct model assertions in Mongo integration tests to the test tenant. */
export async function enterTestTenant(moduleRef: TestingModule): Promise<void> {
  const resolver = moduleRef.get(TenantResolver);
  const context = moduleRef.get(TenantContext);
  const scope = await resolver.resolveBySlug(env.AUTH_TENANT_SLUG);
  await resolver.ensureConnection(scope);
  context.enter(scope);
}

export async function withTestTenant<T>(
  moduleRef: TestingModule,
  callback: () => Promise<T>,
): Promise<T> {
  const resolver = moduleRef.get(TenantResolver);
  const context = moduleRef.get(TenantContext);
  const scope = await resolver.resolveBySlug(env.AUTH_TENANT_SLUG);
  await resolver.ensureConnection(scope);
  return context.run(scope, callback);
}
