import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthenticationModule } from '../common/guards/authentication.module';
import { MASTER_CONNECTION } from '../tenancy/master-connection';
import {
  PlatformUserRecord,
  PlatformUserSchema,
} from '../tenancy/schemas/platform-user.schema';
import { BillingController } from './billing.controller';
import { BillingCoreModule } from './billing-core.module';
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [
    AuthenticationModule,
    BillingCoreModule,
    SecurityModule,
    MongooseModule.forFeature(
      [{ name: PlatformUserRecord.name, schema: PlatformUserSchema }],
      MASTER_CONNECTION,
    ),
  ],
  controllers: [BillingController],
  exports: [BillingCoreModule],
})
export class BillingModule {}
