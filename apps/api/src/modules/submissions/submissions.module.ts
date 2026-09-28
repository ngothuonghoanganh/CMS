import { Module } from '@nestjs/common';

import { AuthenticationModule } from '../../common/guards/authentication.module';
import { SecurityModule } from '../../security/security.module';
import { CoreEventsModule } from '../../shared/events/core-events.module';
import { TenantModelsModule } from '../../tenancy/tenant-models.module';
import { TenantModule } from '../../tenancy/tenant.module';
import {
  PublicSubmissionController,
  SubmissionController,
} from './submission.controller';
import { SubmissionService } from './submission.service';

@Module({
  imports: [
    AuthenticationModule,
    SecurityModule,
    CoreEventsModule,
    TenantModelsModule,
    TenantModule,
  ],
  controllers: [SubmissionController, PublicSubmissionController],
  providers: [SubmissionService],
  exports: [SubmissionService],
})
export class SubmissionsModule {}
