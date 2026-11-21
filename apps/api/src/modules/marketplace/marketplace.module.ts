import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PagesModule } from '../pages/pages.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { MarketplaceController } from './marketplace.controller.js';
import { MarketplaceCoreModule } from './marketplace-core.module.js';
import { MarketplaceService } from './marketplace.service.js';

/**
 * The template marketplace (ADR-036): browsing the catalog (boards 30 and 31), claiming a free
 * item, and the workspace's licences with their version updates (board 32), which count the pages
 * made from each item (pages). The catalog and the licences themselves are in
 * `MarketplaceCoreModule`; buying comes with MP3.
 */
@Module({
  imports: [WorkspacesModule, AuthModule, PagesModule, MarketplaceCoreModule],
  controllers: [MarketplaceController],
  providers: [MarketplaceService],
})
export class MarketplaceModule {}
