import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { MarketplaceCatalog } from '@plp/contracts';
import type { Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import { licenceProblems } from './domain/licence-check.js';
import { InjectMarketplaceCatalog } from './marketplace-catalog.js';
import { MarketplaceLicencesRepository } from './marketplace-licences.repository.js';

/**
 * Before the API serves (ADR-036): every licence must name an item of the catalog that is not a
 * draft, at a version still in the file with the content it was granted. Otherwise the API does
 * not start, naming each problem, like a catalog that does not match its schema: Payload stops an
 * item's sale by withdrawing it, and changes it with a new version, never by editing the file
 * under a licence. It runs before any job starts (`onModuleInit`).
 */
@Injectable()
export class MarketplaceLicenceCheck implements OnModuleInit {
  constructor(
    @InjectEnv() private readonly env: Env,
    @InjectMarketplaceCatalog() private readonly catalog: MarketplaceCatalog,
    private readonly licences: MarketplaceLicencesRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    const problems = licenceProblems(this.catalog, await this.licences.versionsInUse());
    if (problems.length > 0) {
      throw new Error(
        `The marketplace catalog ${this.env.MARKETPLACE_CATALOG_FILE} does not serve the licences workspaces hold (ADR-036):\n${problems.join('\n')}`,
      );
    }
  }
}
