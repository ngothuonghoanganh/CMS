import { Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import {
  CreateTenantRequestSchema,
  PlatformPermissions,
  type CreateTenantRequest,
} from '@payload/contracts';

import { AuthenticationGuard } from '../common/guards/authentication.guard';
import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import type { PlatformRequest } from '../common/interfaces/request';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { PlatformAuthorizationService } from '../security/platform-authorization.service';
import { PlatformAuditService } from '../security/platform-audit.service';

@Controller('control-plane/tenants')
@UseGuards(AuthenticationGuard)
export class TenantController {
  constructor(
    @Inject(TenantProvisioningService)
    private readonly provisioning: TenantProvisioningService,
    @Inject(PlatformAuthorizationService)
    private readonly platformAuthorization: PlatformAuthorizationService,
    @Inject(PlatformAuditService) private readonly platformAudit: PlatformAuditService,
  ) {}

  @Get()
  async list(@CurrentPrincipal() principal: PlatformRequest['auth']) {
    await this.platformAuthorization.assertCan(principal, PlatformPermissions.TenantRead);
    return this.provisioning.list();
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(CreateTenantRequestSchema)) input: CreateTenantRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.platformAuthorization.assertCan(
      principal,
      PlatformPermissions.TenantCreate,
    );
    const result = await this.provisioning.create(input);
    await this.platformAudit
      .record({
        actorType: 'platform_user',
        actorId: principal?.subject ?? 'unknown',
        action: 'platform.tenant.create',
        resourceType: 'tenant',
        resourceId: result.id,
        result: 'success',
        metadata: { slug: result.slug },
      })
      .catch(() => undefined);
    return result;
  }

  @Post(':tenantId/provision')
  async retry(
    @Param('tenantId') tenantId: string,
    @Body(new ZodValidationPipe(CreateTenantRequestSchema)) input: CreateTenantRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.platformAuthorization.assertCan(
      principal,
      PlatformPermissions.TenantUpdate,
    );
    const result = await this.provisioning.retry(tenantId, input);
    await this.platformAudit
      .record({
        actorType: 'platform_user',
        actorId: principal?.subject ?? 'unknown',
        action: 'platform.tenant.update',
        resourceType: 'tenant',
        resourceId: tenantId,
        result: 'success',
        metadata: { action: 'provision' },
      })
      .catch(() => undefined);
    return result;
  }
}
