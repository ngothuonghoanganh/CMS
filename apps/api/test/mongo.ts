import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { MAX_MASTER_DB_NAME_LENGTH } from '../src/shared/persistence/workspace-databases.js';

/** Returns a connection string for a database that belongs to one test file only. */
export function isolatedMongoUri(prefix: string): string {
  const base = process.env['MONGODB_URI'];
  if (!base) {
    throw new Error(
      'MONGODB_URI is not set. Start the infrastructure with `pnpm infra:up` and copy .env.example to .env.',
    );
  }
  const url = new URL(base);
  // Within `MAX_MASTER_DB_NAME_LENGTH`, so the workspace databases' names fit too (ADR-025).
  url.pathname = `/${prefix.slice(0, MAX_MASTER_DB_NAME_LENGTH - 9)}_${randomUUID().slice(0, 8)}`;
  return url.toString();
}

/** Drops the master database of `uri` and every workspace database it made (ADR-025). */
export async function dropDatabase(uri: string): Promise<void> {
  const connection = await mongoose.createConnection(uri).asPromise();
  try {
    const { db } = connection;
    if (!db) {
      throw new Error(`No database for ${connection.name}`);
    }
    const { databases } = await db.admin().listDatabases({ nameOnly: true });
    const workspaces = databases
      .map(({ name }) => name)
      .filter((name) => name.startsWith(`${connection.name}_ws_`));
    for (const name of workspaces) {
      await connection.useDb(name).dropDatabase();
    }
    await connection.dropDatabase();
  } finally {
    await connection.close();
  }
}
