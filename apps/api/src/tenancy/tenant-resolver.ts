import { InjectModel } from '@nestjs/mongoose';
import {
  Inject,
  Injectable,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';

import { env } from '../config/env';
import { MASTER_CONNECTION } from './master-connection';
import {
  TenantDomainRecord,
  type TenantDomainDocument,
} from './schemas/tenant-domain.schema';
import { TenantRecord, type TenantDocument } from './schemas/tenant.schema';
import {
  PublicSiteRouteRecord,
  type PublicSiteRouteDocument,
} from './schemas/public-site-route.schema';
import { TenantConnectionManager } from './tenant-connection.manager';
import type { TenantScope } from './tenant-context';

@Injectable()
export class TenantResolver {
  constructor(
    @InjectModel(TenantRecord.name, MASTER_CONNECTION)
    private readonly tenantModel: Model<TenantRecord>,
    @InjectModel(TenantDomainRecord.name, MASTER_CONNECTION)
    private readonly domainModel: Model<TenantDomainRecord>,
    @InjectModel(PublicSiteRouteRecord.name, MASTER_CONNECTION)
    private readonly publicSiteRouteModel: Model<PublicSiteRouteRecord>,
    @Inject(TenantConnectionManager)
    private readonly connections: TenantConnectionManager,
  ) {}

  async resolveById(
    id: string,
    options: { allowInactive?: boolean } = {},
  ): Promise<TenantScope> {
    const record = await this.tenantModel.findById(id).exec();
    return this.toScope(this.requireUsable(record, options.allowInactive));
  }

  async resolveBySlug(
    slug: string,
    options: { allowInactive?: boolean } = {},
  ): Promise<TenantScope> {
    const record = await this.tenantModel
      .findOne({ slug: slug.trim().toLowerCase() })
      .exec();
    return this.toScope(this.requireUsable(record, options.allowInactive));
  }

  async resolveByHostname(
    hostname: string,
    kind: 'public' | 'cms' = 'public',
  ): Promise<TenantScope> {
    const domain = await this.domainModel
      .findOne({ hostname: hostname.trim().toLowerCase(), kind, status: 'active' })
      .exec();
    if (!domain) throw this.notFound();
    return this.resolveById(domain.tenantId);
  }

  /** Resolve a platform URL without touching a tenant database first. */
  async resolveByPublicSiteSlug(siteSlug: string): Promise<TenantScope> {
    const route = await this.publicSiteRouteModel
      .findOne({ siteSlug: siteSlug.trim().toLowerCase(), status: 'active' })
      .exec();
    if (!route) throw this.notFound();
    return this.resolveById(route.tenantId);
  }

  async registerPublicSiteRoute(input: {
    siteSlug: string;
    tenantId: string;
    tenantSlug: string;
    databaseKey: string;
    workspaceId: string;
    siteId: string;
  }): Promise<PublicSiteRouteDocument> {
    const siteSlug = input.siteSlug.trim().toLowerCase();
    const existing = await this.publicSiteRouteModel.findOne({ siteSlug }).exec();
    if (
      existing &&
      (existing.tenantId !== input.tenantId || existing.siteId !== input.siteId)
    ) {
      throw new ConflictException({
        code: 'PUBLIC_SITE_SLUG_TAKEN',
        message: 'That public site URL is already in use',
      });
    }

    try {
      const route = await this.publicSiteRouteModel
        .findOneAndUpdate(
          { tenantId: input.tenantId, siteId: input.siteId },
          {
            $set: {
              siteSlug,
              tenantSlug: input.tenantSlug.trim().toLowerCase(),
              databaseKey: input.databaseKey,
              workspaceId: input.workspaceId,
              status: 'active',
            },
            $setOnInsert: { _id: randomUUID() },
          },
          { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
        )
        .exec();
      if (!route) throw new Error('PUBLIC_SITE_ROUTE_REGISTRATION_FAILED');
      return route;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException({
          code: 'PUBLIC_SITE_SLUG_TAKEN',
          message: 'That public site URL is already in use',
        });
      }
      throw error;
    }
  }

  async removePublicSiteRoute(tenantId: string, siteId: string): Promise<void> {
    await this.publicSiteRouteModel.deleteOne({ tenantId, siteId }).exec();
  }

  async resolveForLogin(input: {
    tenantSlug?: string | undefined;
    hostname?: string | undefined;
  }): Promise<TenantScope> {
    if (input.tenantSlug) return this.resolveBySlug(input.tenantSlug);
    if (input.hostname) {
      const resolved = await this.resolveHostnameIfMapped(input.hostname, 'cms');
      if (resolved) return resolved;
    }

    // Local development has an explicit server-side tenant selection. It is a
    // configuration value, not a client-provided database authority.
    if (env.NODE_ENV !== 'production' && env.AUTH_TENANT_SLUG) {
      return this.resolveBySlug(env.AUTH_TENANT_SLUG);
    }
    throw this.notFound();
  }

  async resolvePlatformTenant(): Promise<TenantScope> {
    return this.resolveBySlug(env.AUTH_TENANT_SLUG);
  }

  async ensureConnection(scope: TenantScope): Promise<void> {
    try {
      await this.connections.get(scope);
    } catch {
      throw new ServiceUnavailableException({
        code: 'TENANT_DATABASE_UNAVAILABLE',
        message: 'The tenant database is temporarily unavailable',
      });
    }
  }

  async registerDomain(input: {
    tenantId: string;
    hostname: string;
    kind?: 'public' | 'cms';
    sourceDomainId?: string;
  }): Promise<TenantDomainDocument> {
    return this.domainModel
      .findOneAndUpdate(
        { hostname: input.hostname, kind: input.kind ?? 'public' },
        {
          $set: {
            tenantId: input.tenantId,
            status: 'active',
            ...(input.sourceDomainId ? { sourceDomainId: input.sourceDomainId } : {}),
          },
          $setOnInsert: {
            _id: randomUUID(),
            hostname: input.hostname,
            kind: input.kind ?? 'public',
          },
        },
        { new: true, upsert: true, runValidators: true },
      )
      .exec() as Promise<TenantDomainDocument>;
  }

  async disableDomain(hostname: string, sourceDomainId: string): Promise<void> {
    await this.domainModel
      .updateOne({ hostname, sourceDomainId }, { $set: { status: 'disabled' } })
      .exec();
  }

  toScope(record: TenantDocument): TenantScope {
    return {
      id: record._id.toString(),
      slug: record.slug,
      name: record.name,
      status: record.status,
      databaseKey: record.databaseKey,
      databaseName: record.databaseName,
      ...(record.clusterKey ? { clusterKey: record.clusterKey } : {}),
      schemaVersion: record.schemaVersion,
    };
  }

  private async resolveHostnameIfMapped(
    hostname: string,
    kind: 'public' | 'cms',
  ): Promise<TenantScope | undefined> {
    const domain = await this.domainModel
      .findOne({ hostname: hostname.trim().toLowerCase(), kind, status: 'active' })
      .exec();
    return domain ? this.resolveById(domain.tenantId) : undefined;
  }

  private requireUsable(
    record: TenantDocument | null,
    allowInactive = false,
  ): TenantDocument {
    if (!record) throw this.notFound();
    if (!allowInactive && record.status !== 'active') {
      throw new ServiceUnavailableException({
        code: 'TENANT_UNAVAILABLE',
        message: 'The tenant is not available',
      });
    }
    return record;
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'TENANT_NOT_FOUND',
      message: 'The requested tenant was not found',
    });
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}
