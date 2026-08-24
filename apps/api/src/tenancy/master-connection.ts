import { env } from '../config/env';

export const MASTER_CONNECTION = 'MasterConnection';

/**
 * MONGODB_URI is retained as the cluster URI and as the legacy database hint for
 * the first-tenant migration. The application never uses the URI's database
 * name for tenant requests; the Master DB name is explicit.
 */
export function masterDatabaseUri(): string {
  try {
    const parsed = new URL(env.MONGODB_URI);
    parsed.pathname = `/${env.MONGODB_MASTER_DATABASE_NAME}`;
    return parsed.toString();
  } catch {
    return env.MONGODB_URI;
  }
}

export function legacyDatabaseName(): string {
  try {
    const parsed = new URL(env.MONGODB_URI);
    const databaseName = parsed.pathname.replace(/^\/+/, '');
    return databaseName || env.MONGODB_LEGACY_DATABASE_NAME;
  } catch {
    return env.MONGODB_LEGACY_DATABASE_NAME;
  }
}
