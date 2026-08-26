import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  AssignSubscriptionRequestSchema,
  CreatePlanRequestSchema,
  EntityIdSchema,
  UpdatePlanRequestSchema,
  PlatformPermissions,
  type AssignSubscriptionRequest,
  type CreatePlanRequest,
  type UpdatePlanRequest,
} from '@payload/contracts';

import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { AuthenticationGuard } from '../common/guards/authentication.guard';
import type { PlatformRequest } from '../common/interfaces/request';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PlanService } from './plan.service';
import { QuotaService } from './quota.service';
import { SubscriptionService } from './subscription.service';
import { AuthorizationService } from '../security/authorization.service';
import { PlatformAuthorizationService } from '../security/platform-authorization.service';
import { PlatformAuditService } from '../security/platform-audit.service';

@Controller()
@UseGuards(AuthenticationGuard)
export class BillingController {
  constructor(
    @Inject(PlanService) private readonly plans: PlanService,
    @Inject(SubscriptionService) private readonly subscriptions: SubscriptionService,
    @Inject(QuotaService) private readonly quotas: QuotaService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(PlatformAuthorizationService)
    private readonly platformAuthorization: PlatformAuthorizationService,
    @Inject(PlatformAuditService) private readonly platformAudit: PlatformAuditService,
  ) {}

  @Get('billing')
  async summary(@CurrentPrincipal() principal: PlatformRequest['auth']) {
    await this.authorization.assertCan(principal, 'billing.read');
    return this.quotas.getSummary(this.requireTenantId(principal));
  }

  @Get('billing/subscription')
  async subscription(@CurrentPrincipal() principal: PlatformRequest['auth']) {
    await this.authorization.assertCan(principal, 'billing.read');
    return this.subscriptions.getCurrent(this.requireTenantId(principal));
  }

  @Get('billing/entitlements')
  async entitlements(@CurrentPrincipal() principal: PlatformRequest['auth']) {
    await this.authorization.assertCan(principal, 'billing.read');
    return this.quotas.getEntitlements(this.requireTenantId(principal));
  }

  @Get('billing/usage')
  async usage(@CurrentPrincipal() principal: PlatformRequest['auth']) {
    await this.authorization.assertCan(principal, 'billing.read');
    return this.quotas.getUsage(this.requireTenantId(principal));
  }

  @Get('platform/plans')
  async listPlans(@CurrentPrincipal() principal: PlatformRequest['auth']) {
    await this.platformAuthorization.assertCan(principal, PlatformPermissions.PlanRead);
    return this.plans.list();
  }

  @Post('platform/plans')
  async createPlan(
    @Body(new ZodValidationPipe(CreatePlanRequestSchema)) input: CreatePlanRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.platformAuthorization.assertCan(principal, PlatformPermissions.PlanCreate);
    const result = await this.plans.create(input);
    await this.platformAudit
      .record({
        actorType: 'platform_user',
        actorId: principal?.subject ?? 'unknown',
        action: 'platform.plan.create',
        resourceType: 'plan',
        resourceId: result.id,
        result: 'success',
        metadata: { key: result.key },
      })
      .catch(() => undefined);
    return result;
  }

  @Get('platform/plans/:planId')
  async getPlan(
    @Param('planId') planId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.platformAuthorization.assertCan(principal, PlatformPermissions.PlanRead);
    return this.plans.getById(planId);
  }

  @Patch('platform/plans/:planId')
  async updatePlan(
    @Param('planId') planId: string,
    @Body(new ZodValidationPipe(UpdatePlanRequestSchema)) input: UpdatePlanRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.platformAuthorization.assertCan(principal, PlatformPermissions.PlanUpdate);
    const result = await this.plans.update(planId, input);
    await this.platformAudit
      .record({
        actorType: 'platform_user',
        actorId: principal?.subject ?? 'unknown',
        action: 'platform.plan.update',
        resourceType: 'plan',
        resourceId: planId,
        result: 'success',
        metadata: { changedFields: Object.keys(input) },
      })
      .catch(() => undefined);
    return result;
  }

  @Post('platform/tenants/:tenantId/subscription')
  async assignSubscription(
    @Param('tenantId') tenantId: string,
    @Body(new ZodValidationPipe(AssignSubscriptionRequestSchema))
    input: AssignSubscriptionRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.platformAuthorization.assertCan(
      principal,
      PlatformPermissions.SubscriptionUpdate,
    );
    const result = await this.subscriptions.assign(tenantId, input);
    await this.platformAudit
      .record({
        actorType: 'platform_user',
        actorId: principal?.subject ?? 'unknown',
        action: 'platform.subscription.update',
        resourceType: 'tenant_subscription',
        resourceId: result.id,
        result: 'success',
        metadata: { tenantId, planId: result.planId, status: result.status },
      })
      .catch(() => undefined);
    return result;
  }

  private requireTenantId(principal: PlatformRequest['auth']): string {
    if (!principal?.tenantId || !EntityIdSchema.safeParse(principal.tenantId).success) {
      throw new ForbiddenException({
        code: 'TENANT_CONTEXT_REQUIRED',
        message: 'An active tenant context is required',
      });
    }
    return principal.tenantId;
  }
}
