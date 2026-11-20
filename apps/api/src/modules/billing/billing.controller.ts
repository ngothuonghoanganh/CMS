import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  type BillingSummary,
  type ChangePlanRequest,
  changePlanRequestSchema,
  type PlanCatalogResponse,
  type WorkspacePlan,
} from '@plp/contracts';
import { ZodPipe } from '../../shared/zod.pipe.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { BillingService } from './billing.service.js';

/** Plans and the workspace's subscription (ADR-035, board 28). */
@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** Any signed-in user: the plans to compare. */
  @Get('billing/plans')
  plans(): PlanCatalogResponse {
    return this.billing.catalogResponse();
  }

  @Get('workspaces/:workspaceId/plan')
  workspacePlan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ): Promise<WorkspacePlan> {
    return this.billing.workspacePlan(user, workspaceId);
  }

  @Get('workspaces/:workspaceId/billing')
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ): Promise<BillingSummary> {
    return this.billing.summary(user, workspaceId);
  }

  @Post('workspaces/:workspaceId/billing/plan')
  @HttpCode(200)
  changePlan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Body(new ZodPipe(changePlanRequestSchema)) body: ChangePlanRequest,
  ): Promise<BillingSummary> {
    return this.billing.changePlan(user, workspaceId, body);
  }
}
