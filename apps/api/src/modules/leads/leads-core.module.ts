import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LeadLimitsRepository } from './lead-limits.repository.js';
import { LEAD_LIMIT_MODEL, LEAD_MODEL, leadLimitSchema, leadSchema } from './lead.schema.js';
import { LeadsRepository } from './leads.repository.js';

/**
 * Lead persistence, without HTTP. The privacy module recomputes expiries when the retention
 * changes; it is separate from `LeadsModule`, which depends on pages and publishing.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LEAD_MODEL, schema: leadSchema },
      { name: LEAD_LIMIT_MODEL, schema: leadLimitSchema },
    ]),
  ],
  providers: [LeadsRepository, LeadLimitsRepository],
  exports: [LeadsRepository, LeadLimitsRepository],
})
export class LeadsCoreModule {}
