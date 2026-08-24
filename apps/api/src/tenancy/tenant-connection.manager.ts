import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { createConnection, type Connection } from 'mongoose';

import { env } from '../config/env';
import type { TenantScope } from './tenant-context';

type CachedConnection = {
  connection: Connection;
  lastUsedAt: number;
};

/**
 * Owns tenant connections. Connections are cached by database identity and are
 * never selected by mutating the default/global Mongoose connection.
 */
@Injectable()
export class TenantConnectionManager implements OnModuleDestroy {
  private readonly logger = new Logger(TenantConnectionManager.name);
  private readonly connections = new Map<string, CachedConnection>();
  private readonly opening = new Map<string, Promise<Connection>>();

  async get(
    scope: Pick<TenantScope, 'databaseName' | 'clusterKey'>,
  ): Promise<Connection> {
    const key = `${scope.clusterKey ?? 'primary'}:${scope.databaseName}`;
    const cached = this.connections.get(key);
    if (cached) {
      cached.lastUsedAt = Date.now();
      return cached.connection;
    }

    const pending = this.opening.get(key);
    if (pending) return pending;

    const opening = this.openConnection(key, scope.databaseName);
    this.opening.set(key, opening);
    try {
      return await opening;
    } finally {
      if (this.opening.get(key) === opening) this.opening.delete(key);
    }
  }

  getCached(scope: Pick<TenantScope, 'databaseName' | 'clusterKey'>): Connection {
    const key = `${scope.clusterKey ?? 'primary'}:${scope.databaseName}`;
    const cached = this.connections.get(key);
    if (!cached) {
      throw new Error('TENANT_CONNECTION_NOT_READY');
    }
    cached.lastUsedAt = Date.now();
    return cached.connection;
  }

  async close(databaseName?: string): Promise<void> {
    const entries = [...this.connections.entries()].filter(([key]) =>
      databaseName ? key.endsWith(`:${databaseName}`) : true,
    );
    await Promise.all(
      entries.map(async ([key, cached]) => {
        this.connections.delete(key);
        await cached.connection.close();
      }),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }

  private tenantUri(databaseName: string): string {
    const parsed = new URL(env.MONGODB_URI);
    parsed.pathname = `/${databaseName}`;
    return parsed.toString();
  }

  private async openConnection(key: string, databaseName: string): Promise<Connection> {
    await this.pruneConnections(key);
    const connection = createConnection(this.tenantUri(databaseName), {
      connectTimeoutMS: 3_000,
      serverSelectionTimeoutMS: 3_000,
      maxPoolSize: 10,
      minPoolSize: 0,
    });
    try {
      await connection.asPromise();
    } catch (error) {
      await connection.close().catch(() => undefined);
      throw error;
    }
    this.connections.set(key, { connection, lastUsedAt: Date.now() });
    this.logger.debug(`Opened tenant database connection ${databaseName}`);
    return connection;
  }

  private async pruneConnections(excludeKey?: string): Promise<void> {
    const now = Date.now();
    const idleMs = env.TENANT_CONNECTION_IDLE_TTL_SECONDS * 1_000;
    const stale = [...this.connections.entries()].filter(
      ([key, cached]) => key !== excludeKey && now - cached.lastUsedAt >= idleMs,
    );
    for (const [key, cached] of stale) {
      this.connections.delete(key);
      await cached.connection.close().catch(() => undefined);
    }

    while (this.connections.size >= env.TENANT_CONNECTION_MAX_CACHED) {
      const oldest = [...this.connections.entries()]
        .filter(([key]) => key !== excludeKey)
        .sort(([, left], [, right]) => left.lastUsedAt - right.lastUsedAt)[0];
      if (!oldest) break;
      this.connections.delete(oldest[0]);
      await oldest[1].connection.close().catch(() => undefined);
    }
  }
}
