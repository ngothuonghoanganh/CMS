import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module.js';
import { PagesModule } from '../pages/pages.module.js';
import { PreviewModule } from '../preview/preview.module.js';
import { PublishingCoreModule } from '../publishing/publishing-core.module.js';
import { SitesCoreModule } from '../sites/sites-core.module.js';
import { PublicDeliveryController } from './public-delivery.controller.js';
import { PublicDeliveryService } from './public-delivery.service.js';

/** Public delivery for the renderer: resolve, sitemap and signed previews. */
@Module({
  imports: [AssetsModule, PagesModule, PreviewModule, PublishingCoreModule, SitesCoreModule],
  controllers: [PublicDeliveryController],
  providers: [PublicDeliveryService],
})
export class PublicDeliveryModule {}
