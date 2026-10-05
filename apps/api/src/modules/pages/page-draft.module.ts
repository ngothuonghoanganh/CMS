import { Module } from '@nestjs/common';

import { TenantModelsModule } from '../../tenancy/tenant-models.module';
import { PageDraftService } from './page-draft.service';

@Module({
  imports: [TenantModelsModule],
  providers: [PageDraftService],
  exports: [PageDraftService],
})
export class PageDraftModule {}
