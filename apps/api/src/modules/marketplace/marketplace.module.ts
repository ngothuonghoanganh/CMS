import { Module } from '@nestjs/common';
import type { Env } from '../../config/env.js';
import { ENV } from '../../shared/env.js';
import { AuthModule } from '../auth/auth.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { loadMarketplaceCatalog, MARKETPLACE_CATALOG } from './marketplace-catalog.js';
import { MarketplaceController } from './marketplace.controller.js';
import { MarketplaceService } from './marketplace.service.js';

/**
 * The template marketplace (ADR-036): the catalog file Payload sells from, and the screens that
 * browse it (MP1). Licences, claiming and buying come with MP2 and MP3.
 */
@Module({
  imports: [WorkspacesModule, AuthModule],
  controllers: [MarketplaceController],
  providers: [
    // Read once at startup: an invalid file stops the API before it serves (ADR-036).
    {
      provide: MARKETPLACE_CATALOG,
      inject: [ENV],
      useFactory: (env: Env) => loadMarketplaceCatalog(env.MARKETPLACE_CATALOG_FILE),
    },
    MarketplaceService,
  ],
})
export class MarketplaceModule {}
