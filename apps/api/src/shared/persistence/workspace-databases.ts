import { type DynamicModule, Injectable, Module } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection, Model, Schema } from 'mongoose';
import type { ObjectId } from './object-id.js';

/** A collection that lives in each workspace's own database (ADR-025). */
export interface WorkspaceCollection<T> {
  readonly name: string;
  readonly schema: Schema<T>;
}

/** What a workspace database is opened for: a scope, or a record routed from the master DB. */
export interface WorkspaceRef {
  readonly workspaceId: ObjectId;
}

export function workspaceCollection<T>(name: string, schema: Schema<T>): WorkspaceCollection<T> {
  return { name, schema };
}

/** `{master}_ws_{24 hex}` must stay under MongoDB's 64 bytes for a database name. */
export const MAX_MASTER_DB_NAME_LENGTH = 35;

/** At most this many workspace databases get their indexes built at once. */
const BUILD_CONCURRENCY = 8;

/**
 * The databases of the workspaces (ADR-025). They share the master's client, so one transaction
 * writes the master and a workspace database alike. The workspace id must come from a
 * `WorkspaceScope` or a master record (a site address, a domain, a signed token), never from the
 * client.
 */
@Injectable()
export class WorkspaceDatabases {
  private readonly collections = new Map<string, Schema>();

  constructor(@InjectConnection() private readonly master: Connection) {
    if (master.name.length > MAX_MASTER_DB_NAME_LENGTH) {
      throw new Error(
        `The master database name "${master.name}" is longer than ${MAX_MASTER_DB_NAME_LENGTH} characters: workspace database names would not fit`,
      );
    }
  }

  /** Called by `WorkspaceCollectionsModule.forFeature`, before any database is opened. */
  register(collections: readonly { name: string; schema: Schema }[]): void {
    for (const { name, schema } of collections) {
      this.collections.set(name, schema);
    }
  }

  nameOf(workspaceId: ObjectId): string {
    return `${this.master.name}_ws_${workspaceId.toHexString()}`;
  }

  model<T>(ref: WorkspaceRef, collection: WorkspaceCollection<T>): Model<T> {
    const db = this.open(ref.workspaceId);
    const existing: Model<T> | undefined = db.models[collection.name];
    return existing ?? db.model<T>(collection.name, collection.schema);
  }

  /**
   * Creates every collection and index of the workspace's database. Safe to run again: the API
   * runs it for every workspace at startup, so a new index reaches the databases already there.
   */
  async build(workspaceId: ObjectId): Promise<void> {
    for (const model of this.models(workspaceId)) {
      try {
        await model.createCollection();
        await model.createIndexes();
      } catch (error) {
        throw new Error(
          `Creating the collection and indexes of ${model.modelName} in ${this.nameOf(workspaceId)} failed`,
          { cause: error },
        );
      }
    }
  }

  /** Every registered collection's model in the workspace's database. */
  models(workspaceId: ObjectId) {
    const db = this.open(workspaceId);
    return [...this.collections].map(([name, schema]) => db.models[name] ?? db.model(name, schema));
  }

  /** Builds the databases of every workspace given, a few at once; stops at the first failure. */
  async buildAll(workspaceIds: AsyncIterable<ObjectId>): Promise<void> {
    const ids = workspaceIds[Symbol.asyncIterator]();
    let failed = false;
    const worker = async (): Promise<void> => {
      for (let next = await ids.next(); !next.done && !failed; next = await ids.next()) {
        try {
          await this.build(next.value);
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    };
    await Promise.all(Array.from({ length: BUILD_CONCURRENCY }, worker));
  }

  async drop(workspaceId: ObjectId): Promise<void> {
    await this.open(workspaceId).dropDatabase();
  }

  private open(workspaceId: ObjectId): Connection {
    return this.master.useDb(this.nameOf(workspaceId), { useCache: true });
  }
}

/** Registers a module's workspace collections, like `MongooseModule.forFeature` for the master. */
@Module({})
export class WorkspaceCollectionsModule {
  static forFeature(collections: readonly { name: string; schema: Schema }[]): DynamicModule {
    return {
      module: WorkspaceCollectionsModule,
      providers: [
        {
          provide: `workspace collections ${collections.map(({ name }) => name).join(',')}`,
          inject: [WorkspaceDatabases],
          useFactory: (databases: WorkspaceDatabases) => {
            databases.register(collections);
            return collections;
          },
        },
      ],
    };
  }
}
