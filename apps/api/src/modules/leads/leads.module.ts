import { Module } from '@nestjs/common';
import { RendererSignatureGuard } from '../../shared/renderer-channel/renderer-request.js';
import { PagesModule } from '../pages/pages.module.js';
import { PublishingCoreModule } from '../publishing/publishing-core.module.js';
import { SitesCoreModule } from '../sites/sites-core.module.js';
import { LeadIntakeService } from './lead-intake.service.js';
import { LeadsCoreModule } from './leads-core.module.js';
import { PublicLeadsController } from './public-leads.controller.js';

/** Lead intake from public pages (ADR-016). */
@Module({
  imports: [LeadsCoreModule, PagesModule, PublishingCoreModule, SitesCoreModule],
  controllers: [PublicLeadsController],
  providers: [LeadIntakeService, RendererSignatureGuard],
})
export class LeadsModule {}
