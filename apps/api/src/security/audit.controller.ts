import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import {
  AuditLogQuerySchema,
  PlatformPermissions,
  type AuditLogQuery,
} from '@payload/contracts';

import { AuthenticationGuard } from '../common/guards/authentication.guard';
import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import type { PlatformRequest } from '../common/interfaces/request';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuditService } from './audit.service';
import { AuthorizationService } from './authorization.service';
import { PlatformAuditService } from './platform-audit.service';
import { PlatformAuthorizationService } from './platform-authorization.service';

@Controller()
@UseGuards(AuthenticationGuard)
export class AuditController {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(PlatformAuditService) private readonly platformAudit: PlatformAuditService,
    @Inject(PlatformAuthorizationService)
    private readonly platformAuthorization: PlatformAuthorizationService,
  ) {}

  @Get('audit-logs')
  async list(
    @Query(new ZodValidationPipe(AuditLogQuerySchema)) query: AuditLogQuery,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(
      principal,
      'audit.read',
      query.workspaceId ?? principal?.workspaceId,
    );
    return this.audit.list(query);
  }

  @Get('platform/audit-logs')
  async listPlatform(
    @Query(new ZodValidationPipe(AuditLogQuerySchema)) query: AuditLogQuery,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.platformAuthorization.assertCan(principal, PlatformPermissions.AuditRead);
    return this.platformAudit.list(query);
  }
}
