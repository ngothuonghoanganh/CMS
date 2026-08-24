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
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  AssignSubscriptionRequestSchema,
  CreatePlanRequestSchema,
  EntityIdSchema,
  UpdatePlanRequestSchema,
  type AssignSubscriptionRequest,
  type CreatePlanRequest,
  type UpdatePlanRequest,
} from '@payload/contracts';

import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { AuthenticationGuard } from '../common/guards/authentication.guard';
import type { PlatformRequest } from '../common/interfaces/request';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { MASTER_CONNECTION } from '../tenancy/master-connection';
import { PlatformUserRecord } from '../tenancy/schemas/platform-user.schema';
import { PlanService } from './plan.service';
import { QuotaService } from './quota.service';
import { SubscriptionService } from './subscription.service';

@Controller()
@UseGuards(AuthenticationGuard)
export class BillingController {
  constructor(
    @Inject(PlanService) private readonly plans: PlanService,
    @Inject(SubscriptionService) private readonly subscriptions: SubscriptionService,
    @Inject(QuotaService) private readonly quotas: QuotaService,
    @InjectModel(PlatformUserRecord.name, MASTER_CONNECTION)
    private readonly platformUserModel: Model<PlatformUserRecord>,
  ) {}

  @Get('billing')
  async summary(@CurrentPrincipal() principal: PlatformRequest['auth']) {
    return this.quotas.getSummary(this.requireTenantId(principal));
  }

  @Get('billing/subscription')
  async subscription(@CurrentPrincipal() principal: PlatformRequest['auth']) {
    return this.subscriptions.getCurrent(this.requireTenantId(principal));
  }

  @Get('billing/entitlements')
  async entitlements(@CurrentPrincipal() principal: PlatformRequest['auth']) {
    return this.quotas.getEntitlements(this.requireTenantId(principal));
  }

  @Get('billing/usage')
  async usage(@CurrentPrincipal() principal: PlatformRequest['auth']) {
    return this.quotas.getUsage(this.requireTenantId(principal));
  }

  @Get('platform/plans')
  async listPlans(@CurrentPrincipal() principal: PlatformRequest['auth']) {
    await this.requirePlatformAdmin(principal);
    return this.plans.list();
  }

  @Post('platform/plans')
  async createPlan(
    @Body(new ZodValidationPipe(CreatePlanRequestSchema)) input: CreatePlanRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.requirePlatformAdmin(principal);
    return this.plans.create(input);
  }

  @Get('platform/plans/:planId')
  async getPlan(
    @Param('planId') planId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.requirePlatformAdmin(principal);
    return this.plans.getById(planId);
  }

  @Patch('platform/plans/:planId')
  async updatePlan(
    @Param('planId') planId: string,
    @Body(new ZodValidationPipe(UpdatePlanRequestSchema)) input: UpdatePlanRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.requirePlatformAdmin(principal);
    return this.plans.update(planId, input);
  }

  @Post('platform/tenants/:tenantId/subscription')
  async assignSubscription(
    @Param('tenantId') tenantId: string,
    @Body(new ZodValidationPipe(AssignSubscriptionRequestSchema))
    input: AssignSubscriptionRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.requirePlatformAdmin(principal);
    return this.subscriptions.assign(tenantId, input);
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

  private async requirePlatformAdmin(principal: PlatformRequest['auth']): Promise<void> {
    const platformUser = principal
      ? await this.platformUserModel
          .findOne({
            email: principal.subject.toLowerCase(),
            role: 'platform-admin',
            status: 'active',
          })
          .exec()
      : null;
    if (!platformUser) {
      throw new ForbiddenException({
        code: 'PLATFORM_ADMIN_REQUIRED',
        message: 'Platform administrator access is required',
      });
    }
  }
}
