import type { NextFunction, Request, Response } from 'express';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { normalizeHostname } from '@payload/contracts';

import { TenantContext, type TenantScope } from './tenant-context';
import { TenantResolver } from './tenant-resolver';

/**
 * Resolves anonymous public requests before domain services touch tenant models.
 * Authenticated requests are re-bound by AuthenticationGuard from the signed
 * token, so an incidental public mapping can never override token authority.
 */
@Injectable()
export class TenantResolutionMiddleware {
  constructor(
    @Inject(TenantResolver) private readonly resolver: TenantResolver,
    @Inject(TenantContext) private readonly context: TenantContext,
  ) {}

  async use(request: Request, _response: Response, next: NextFunction): Promise<void> {
    let scope: TenantScope | undefined;
    try {
      if (this.isPublicRequest(request)) {
        const hostname = this.publicHostname(request);
        const publicSiteSlug = this.publicSiteSlug(request);
        const tenantSlug = this.publicTenantSlug(request);
        // Renderer calls arrive through the API transport host. The public
        // site registry must win over that host; custom-domain delivery passes
        // its verified hostname explicitly as a query value.
        scope = publicSiteSlug
          ? await this.resolver.resolveByPublicSiteSlug(publicSiteSlug)
          : hostname
            ? await this.resolver.resolveByHostname(hostname)
            : tenantSlug
              ? await this.resolver.resolveBySlug(tenantSlug)
              : await this.resolver.resolvePlatformTenant();
        await this.resolver.ensureConnection(scope);
      } else {
        const tokenTenantId = this.untrustedAccessTokenTenantId(request);
        if (tokenTenantId) {
          scope = await this.resolver.resolveById(tokenTenantId);
          await this.resolver.ensureConnection(scope);
        }
      }
    } catch {
      if (this.isPublicRequest(request)) {
        next(
          new NotFoundException({
            code: 'TENANT_NOT_FOUND',
            message: 'The requested tenant was not found',
          }),
        );
        return;
      }
      // AuthenticationGuard verifies the signed token and returns the actual
      // authentication error. This pre-resolution is only a connection hint.
    }

    if (scope) {
      this.context.run(scope, next);
    } else {
      next();
    }
  }

  private isPublicRequest(request: Request): boolean {
    return (
      request.path.startsWith('/api/v1/public/') ||
      request.path === '/api/v1/analytics/events'
    );
  }

  private publicHostname(request: Request): string | undefined {
    const queryHostname =
      typeof request.query.hostname === 'string'
        ? normalizeHostname(request.query.hostname)
        : null;
    // Never infer a custom domain from the API transport host.
    return queryHostname ?? undefined;
  }

  private publicTenantSlug(request: Request): string | undefined {
    return typeof request.query.tenantSlug === 'string'
      ? request.query.tenantSlug.trim().toLowerCase()
      : undefined;
  }

  private publicSiteSlug(request: Request): string | undefined {
    const pathMatch = request.path.match(/^\/api\/v1\/public\/sites\/([^/]+)/i);
    if (pathMatch?.[1]) return decodeURIComponent(pathMatch[1]).trim().toLowerCase();
    const body = request.body as { siteSlug?: unknown } | undefined;
    return typeof body?.siteSlug === 'string'
      ? body.siteSlug.trim().toLowerCase()
      : undefined;
  }

  private untrustedAccessTokenTenantId(request: Request): string | undefined {
    const authorization = request.header('authorization');
    const bearer = authorization?.toLowerCase().startsWith('bearer ')
      ? authorization.slice(7).trim()
      : undefined;
    const cookiePrefix = 'payload_access_token=';
    const cookie = request
      .header('cookie')
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(cookiePrefix));
    const token = bearer ?? cookie?.slice(cookiePrefix.length);
    if (!token) return undefined;
    try {
      const encodedPayload = token.split('.')[1];
      if (!encodedPayload) return undefined;
      const payload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      ) as {
        tid?: unknown;
      };
      return typeof payload.tid === 'string' ? payload.tid : undefined;
    } catch {
      return undefined;
    }
  }
}
