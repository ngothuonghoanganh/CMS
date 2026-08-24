import { Inject, Injectable } from '@nestjs/common';
import type { Connection, Model, Schema } from 'mongoose';

import { TenantConnectionManager } from './tenant-connection.manager';
import { TenantContext } from './tenant-context';

@Injectable()
export class TenantModelRegistry {
  constructor(
    @Inject(TenantConnectionManager)
    private readonly connections: TenantConnectionManager,
    @Inject(TenantContext) private readonly context: TenantContext,
  ) {}

  model<T>(name: string, schema: Schema<T>): Model<T> {
    const scope = this.context.require();
    const connection = this.connections.getCached(scope);
    return this.register(connection, name, schema);
  }

  proxy<T>(name: string, schema: Schema<T>): Model<T> {
    const registry = this;
    const target = Object.create(null) as Model<T>;
    return new Proxy(target, {
      get(_target, property) {
        if (
          property === 'then' ||
          property === 'onModuleInit' ||
          property === 'onApplicationBootstrap' ||
          property === 'onModuleDestroy' ||
          property === 'beforeApplicationShutdown' ||
          property === 'onApplicationShutdown'
        ) {
          return undefined;
        }
        const model = registry.model(name, schema);
        const member = Reflect.get(model, property, model);
        return typeof member === 'function' ? member.bind(model) : member;
      },
    }) as Model<T>;
  }

  private register<T>(connection: Connection, name: string, schema: Schema<T>): Model<T> {
    return ((connection.models[name] as Model<T> | undefined) ??
      connection.model(name, schema)) as unknown as Model<T>;
  }
}
