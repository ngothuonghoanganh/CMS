import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BillingCoreModule } from '../billing/billing-core.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { PagesModule } from '../pages/pages.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { MarketplaceController } from './marketplace.controller.js';
import { MarketplaceCoreModule } from './marketplace-core.module.js';
import { MarketplacePurchaseSettlement } from './marketplace-purchase-settlement.js';
import { MarketplacePurchases } from './marketplace-purchases.service.js';
import { MarketplaceService } from './marketplace.service.js';

/**
 * The template marketplace (ADR-036): browsing the catalog (boards 30 and 31), claiming a free
 * item, and the workspace's licences with their version updates (board 32), which count the pages
 * made from each item (pages); and buying a paid item (MP3) through billing's gateway and invoices,
 * whose paid invoice grants the licence (`MarketplacePurchaseSettlement`). The catalog and the
 * licences themselves are in `MarketplaceCoreModule`.
 */
@Module({
  imports: [
    WorkspacesModule,
    AuthModule,
    PagesModule,
    MarketplaceCoreModule,
    BillingCoreModule,
    BillingModule,
  ],
  controllers: [MarketplaceController],
  providers: [MarketplaceService, MarketplacePurchases, MarketplacePurchaseSettlement],
})
export class MarketplaceModule {}
