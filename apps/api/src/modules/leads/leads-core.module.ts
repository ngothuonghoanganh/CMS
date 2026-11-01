import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LeadLimitsRepository } from './lead-limits.repository.js';
import { LEAD_COLLECTION, LEAD_LIMIT_MODEL, leadLimitSchema } from './lead.schema.js';
import { LeadsRepository } from './leads.repository.js';
import { WorkspaceCollectionsModule } from '../../shared/persistence/workspace-databases.js';

/**
 * Lead persistence, without HTTP. The privacy module recomputes expiries when the retention
 * changes; it is separate from `LeadsModule`, which depends on pages and publishing.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: LEAD_LIMIT_MODEL, schema: leadLimitSchema }]),
    WorkspaceCollectionsModule.forFeature([LEAD_COLLECTION]),
  ],
  providers: [LeadsRepository, LeadLimitsRepository],
  exports: [LeadsRepository, LeadLimitsRepository],
})
export class LeadsCoreModule {}
