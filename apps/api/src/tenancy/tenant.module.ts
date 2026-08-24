import { Module } from '@nestjs/common';

import { TenantConnectionManager } from './tenant-connection.manager';
import { TenantContext } from './tenant-context';
import { TenantModelRegistry } from './tenant-model.registry';

@Module({
  exports: [TenantConnectionManager, TenantContext, TenantModelRegistry],
  providers: [TenantConnectionManager, TenantContext, TenantModelRegistry],
})
export class TenantModule {}
