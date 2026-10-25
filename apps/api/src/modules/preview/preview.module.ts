import { Module } from '@nestjs/common';
import { PagesModule } from '../pages/pages.module.js';
import { PublishingCoreModule } from '../publishing/publishing-core.module.js';
import { SitesCoreModule } from '../sites/sites-core.module.js';
import { PreviewTokens } from './preview-tokens.js';
import { PreviewController } from './preview.controller.js';
import { PreviewService } from './preview.service.js';

/** Signed preview links (ADR-010). Public delivery verifies the tokens with `PreviewTokens`. */
@Module({
  imports: [PagesModule, PublishingCoreModule, SitesCoreModule],
  controllers: [PreviewController],
  providers: [PreviewTokens, PreviewService],
  exports: [PreviewTokens],
})
export class PreviewModule {}
