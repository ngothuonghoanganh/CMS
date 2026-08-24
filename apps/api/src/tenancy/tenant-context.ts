import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export type TenantStatus =
  'provisioning' | 'active' | 'suspended' | 'failed' | 'archived';

export type TenantScope = {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  databaseKey: string;
  databaseName: string;
  clusterKey?: string;
  schemaVersion: number;
};

@Injectable()
export class TenantContext {
  private readonly storage = new AsyncLocalStorage<TenantScope>();

  enter(scope: TenantScope): void {
    this.storage.enterWith(scope);
  }

  get(): TenantScope | undefined {
    return this.storage.getStore();
  }

  require(): TenantScope {
    const scope = this.get();
    if (!scope) {
      throw new Error('TENANT_CONTEXT_REQUIRED');
    }
    return scope;
  }

  run<T>(scope: TenantScope, callback: () => T): T {
    return this.storage.run(scope, callback);
  }
}
