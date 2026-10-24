import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';

/** Returns a connection string for a database that belongs to one test file only. */
export function isolatedMongoUri(prefix: string): string {
  const base = process.env['MONGODB_URI'];
  if (!base) {
    throw new Error(
      'MONGODB_URI is not set. Start the infrastructure with `pnpm infra:up` and copy .env.example to .env.',
    );
  }
  const url = new URL(base);
  url.pathname = `/${prefix}_${randomUUID().slice(0, 8)}`;
  return url.toString();
}

export async function dropDatabase(uri: string): Promise<void> {
  const connection = await mongoose.createConnection(uri).asPromise();
  try {
    await connection.dropDatabase();
  } finally {
    await connection.close();
  }
}
