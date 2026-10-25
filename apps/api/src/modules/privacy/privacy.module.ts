import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { SitesCoreModule } from '../sites/sites-core.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { PrivacyController } from './privacy.controller.js';
import { PrivacyCoreModule } from './privacy-core.module.js';
import { PrivacyService } from './privacy.service.js';

/** Personal data settings and consent versions of a site (ADR-017). */
@Module({
  imports: [ActivityModule, AuthModule, PrivacyCoreModule, SitesCoreModule, WorkspacesModule],
  controllers: [PrivacyController],
  providers: [PrivacyService],
})
export class PrivacyModule {}
