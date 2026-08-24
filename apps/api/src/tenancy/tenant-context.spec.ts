import { describe, expect, it } from 'vitest';

import { TenantContext, type TenantScope } from './tenant-context';

const scope = (id: string): TenantScope => ({
  id,
  slug: id,
  name: id,
  status: 'active',
  databaseKey: `mongo:${id}`,
  databaseName: id,
  schemaVersion: 1,
});

describe('TenantContext', () => {
  it('keeps concurrent tenant scopes isolated', async () => {
    const context = new TenantContext();
    const [first, second] = await Promise.all([
      context.run(scope('tenant-a'), async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return context.require().id;
      }),
      context.run(scope('tenant-b'), async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return context.require().id;
      }),
    ]);

    expect(first).toBe('tenant-a');
    expect(second).toBe('tenant-b');
  });
});
