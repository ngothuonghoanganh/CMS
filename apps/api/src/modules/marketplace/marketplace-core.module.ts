import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import type { Env } from '../../config/env.js';
import { ENV } from '../../shared/env.js';
import { loadMarketplaceCatalog, MARKETPLACE_CATALOG } from './marketplace-catalog.js';
import { MarketplaceLicenceCheck } from './marketplace-licence-check.js';
import {
  MARKETPLACE_LICENCE_MODEL,
  marketplaceLicenceSchema,
} from './marketplace-licence.schema.js';
import { MarketplaceLicences } from './marketplace-licences.js';
import { MarketplaceLicencesRepository } from './marketplace-licences.repository.js';

/**
 * The marketplace catalog and the workspaces' licences (ADR-036), without the endpoints: the
 * templates and pages modules take marketplace items from it (`MarketplaceLicences`), and the
 * marketplace's paid invoices will grant licences with `MarketplaceLicencesRepository` (MP3). It
 * depends on no feature module, so any of them may import it.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MARKETPLACE_LICENCE_MODEL, schema: marketplaceLicenceSchema },
    ]),
  ],
  providers: [
    // Read once at startup: an invalid file stops the API before it serves (ADR-036).
    {
      provide: MARKETPLACE_CATALOG,
      inject: [ENV],
      useFactory: (env: Env) => loadMarketplaceCatalog(env.MARKETPLACE_CATALOG_FILE),
    },
    MarketplaceLicencesRepository,
    MarketplaceLicences,
    MarketplaceLicenceCheck,
  ],
  exports: [MARKETPLACE_CATALOG, MarketplaceLicencesRepository, MarketplaceLicences],
})
export class MarketplaceCoreModule {}
