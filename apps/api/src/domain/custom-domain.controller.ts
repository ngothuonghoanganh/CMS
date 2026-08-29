import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  CreateCustomDomainRequestSchema,
  UpdateCustomDomainRequestSchema,
  type CreateCustomDomainRequest,
  type UpdateCustomDomainRequest,
  normalizeHostname,
} from '@payload/contracts';
import type { Request } from 'express';

import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { AuthenticationGuard } from '../common/guards/authentication.guard';
import { requireRequestedWorkspace } from '../common/guards/workspace-context';
import type { PlatformRequest } from '../common/interfaces/request';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CustomDomainService } from './custom-domain.service';
import { TenantContext } from '../tenancy/tenant-context';
import { TenantResolver } from '../tenancy/tenant-resolver';
import { AuthorizationService } from '../security/authorization.service';
import { AuditService } from '../security/audit.service';

@Controller('workspaces/:workspaceId/domains')
@UseGuards(AuthenticationGuard)
export class CustomDomainController {
  constructor(
    @Inject(CustomDomainService) private readonly domainService: CustomDomainService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get()
  async list(
    @Param('workspaceId') workspaceId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'domain.read', workspaceId);
    return this.domainService.list(requireRequestedWorkspace(principal, workspaceId));
  }

  @Post()
  async create(
    @Param('workspaceId') workspaceId: string,
    @Body(new ZodValidationPipe(CreateCustomDomainRequestSchema))
    input: CreateCustomDomainRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'domain.create', workspaceId);
    const result = await this.domainService.create(
      requireRequestedWorkspace(principal, workspaceId),
      input,
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'domain.create',
        resourceType: 'custom_domain',
        resourceId: result.id,
        workspaceId,
        result: 'success',
        metadata: { hostname: result.hostname },
      })
      .catch(() => undefined);
    return result;
  }

  @Get(':domainId')
  async get(
    @Param('workspaceId') workspaceId: string,
    @Param('domainId') domainId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'domain.read', workspaceId);
    return this.domainService.get(
      requireRequestedWorkspace(principal, workspaceId),
      domainId,
    );
  }

  @Patch(':domainId')
  async update(
    @Param('workspaceId') workspaceId: string,
    @Param('domainId') domainId: string,
    @Body(new ZodValidationPipe(UpdateCustomDomainRequestSchema))
    input: UpdateCustomDomainRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'domain.update', workspaceId);
    const result = await this.domainService.update(
      requireRequestedWorkspace(principal, workspaceId),
      domainId,
      input,
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'domain.update',
        resourceType: 'custom_domain',
        resourceId: domainId,
        workspaceId,
        result: 'success',
        metadata: { changedFields: Object.keys(input) },
      })
      .catch(() => undefined);
    return result;
  }

  @Post(':domainId/verify')
  async verify(
    @Param('workspaceId') workspaceId: string,
    @Param('domainId') domainId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'domain.verify', workspaceId);
    const result = await this.domainService.verify(
      requireRequestedWorkspace(principal, workspaceId),
      domainId,
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'domain.verify',
        resourceType: 'custom_domain',
        resourceId: domainId,
        workspaceId,
        result: 'success',
      })
      .catch(() => undefined);
    return result;
  }

  @Delete(':domainId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('workspaceId') workspaceId: string,
    @Param('domainId') domainId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ): Promise<void> {
    await this.authorization.assertCan(principal, 'domain.delete', workspaceId);
    await this.domainService.remove(
      requireRequestedWorkspace(principal, workspaceId),
      domainId,
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'domain.delete',
        resourceType: 'custom_domain',
        resourceId: domainId,
        workspaceId,
        result: 'success',
      })
      .catch(() => undefined);
  }
}

@Controller('public/domains')
export class PublicDomainController {
  constructor(
    @Inject(CustomDomainService) private readonly domainService: CustomDomainService,
    @Inject(TenantResolver) private readonly tenantResolver: TenantResolver,
    @Inject(TenantContext) private readonly tenantContext: TenantContext,
  ) {}

  @Get('resolve')
  async resolve(
    @Query('hostname') hostname: string,
    @Query('path') path = '/',
    @Req() request: Request,
  ) {
    const normalizedHostname = normalizeHostname(hostname ?? '');
    if (!normalizedHostname)
      return this.domainService.resolvePublic(hostname, path, 'unknown');
    const scope = await this.tenantResolver.resolveByHostname(normalizedHostname);
    await this.tenantResolver.ensureConnection(scope);
    return this.tenantContext.run(scope, () =>
      this.domainService.resolvePublic(
        normalizedHostname,
        path,
        request.ip || request.socket.remoteAddress || 'unknown',
      ),
    );
  }

  @Get('routes')
  async routes(@Query('hostname') hostname: string, @Req() request: Request) {
    const normalizedHostname = normalizeHostname(hostname ?? '');
    if (!normalizedHostname)
      return this.domainService.resolvePublicRoutes(hostname, 'unknown');
    const scope = await this.tenantResolver.resolveByHostname(normalizedHostname);
    await this.tenantResolver.ensureConnection(scope);
    return this.tenantContext.run(scope, () =>
      this.domainService.resolvePublicRoutes(
        normalizedHostname,
        request.ip || request.socket.remoteAddress || 'unknown',
      ),
    );
  }
}
