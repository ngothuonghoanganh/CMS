import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { SitesCoreModule } from '../sites/sites-core.module.js';
import { ActivityController } from './activity.controller.js';
import { ActivityRepository } from './activity.repository.js';
import { ACTIVITY_MODEL, activitySchema } from './activity.schema.js';
import { ActivityService } from './activity.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ACTIVITY_MODEL, schema: activitySchema }]),
    AuthModule,
    SitesCoreModule,
  ],
  controllers: [ActivityController],
  providers: [ActivityRepository, ActivityService],
  exports: [ActivityRepository, ActivityService],
})
export class ActivityModule {}
