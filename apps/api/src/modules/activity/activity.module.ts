import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SitesCoreModule } from '../sites/sites-core.module.js';
import { ActivityController } from './activity.controller.js';
import { ActivityRepository } from './activity.repository.js';
import { ACTIVITY_COLLECTION } from './activity.schema.js';
import { ActivityService } from './activity.service.js';
import { WorkspaceCollectionsModule } from '../../shared/persistence/workspace-databases.js';

@Module({
  imports: [
    WorkspaceCollectionsModule.forFeature([ACTIVITY_COLLECTION]),
    AuthModule,
    SitesCoreModule,
  ],
  controllers: [ActivityController],
  providers: [ActivityRepository, ActivityService],
  exports: [ActivityRepository, ActivityService],
})
export class ActivityModule {}
