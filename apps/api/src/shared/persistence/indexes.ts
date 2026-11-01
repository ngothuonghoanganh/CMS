import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';

/**
 * Creates every collection and index of the master DB before the API serves (ADR-013); the
 * workspace databases get theirs from `WorkspaceDatabases.build` (ADR-025). Unique
 * indexes guard invariants (one slug per site, one release per idempotency key, one lead per
 * submission, one counter per key), TTL indexes delete what the retention promises, and some
 * lookups name their index (`hint`). Built in the background (Mongoose's `autoIndex`, off in
 * `AppModule`), they would come after the first requests on a new database: a duplicate could get
 * in, and a hinted query is refused while its index does not exist. Startup fails when one cannot
 * be built (e.g. duplicates already stored) rather than serve without it.
 */
@Injectable()
export class IndexBuilder implements OnModuleInit {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async onModuleInit(): Promise<void> {
    await Promise.all(
      Object.values(this.connection.models).map(async (model) => {
        try {
          await model.createCollection();
          await model.createIndexes();
        } catch (error) {
          throw new Error(`Creating the collection and indexes of ${model.modelName} failed`, {
            cause: error,
          });
        }
      }),
    );
  }
}
