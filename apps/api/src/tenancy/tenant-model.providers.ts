import type { Provider } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import type { Schema } from 'mongoose';

import { TenantModelRegistry } from './tenant-model.registry';

export function tenantModelProvider(name: string, schema: Schema<unknown>): Provider {
  return {
    provide: getModelToken(name),
    inject: [TenantModelRegistry],
    useFactory: (registry: TenantModelRegistry) => registry.proxy(name, schema),
  };
}
