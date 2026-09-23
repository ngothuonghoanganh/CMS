import { Module } from '@nestjs/common';

import { TenantModule } from '../../tenancy/tenant.module';
import { CORE_EVENT_PUBLISHER } from './core-event-publisher';
import { CoreEventBus } from './core-event-bus';

@Module({
  imports: [TenantModule],
  providers: [
    CoreEventBus,
    {
      provide: CORE_EVENT_PUBLISHER,
      useExisting: CoreEventBus,
    },
  ],
  exports: [CoreEventBus, CORE_EVENT_PUBLISHER],
})
export class CoreEventsModule {}
