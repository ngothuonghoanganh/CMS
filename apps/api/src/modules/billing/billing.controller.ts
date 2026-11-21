import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import {
  type BillingSummary,
  type ChangePlanRequest,
  changePlanRequestSchema,
  type PlanCatalogResponse,
  type PlanChangeQuote,
  type PlanChangeQuoteQuery,
  planChangeQuoteQuerySchema,
  type WorkspacePlan,
} from '@plp/contracts';
import type { Response } from 'express';
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

  @Get('workspaces/:workspaceId/billing/plan/quote')
  quote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Query(new ZodPipe(planChangeQuoteQuerySchema)) query: PlanChangeQuoteQuery,
  ): Promise<PlanChangeQuote> {
    return this.billing.quote(user, workspaceId, query);
  }

  /** 200 once the change applies; 202 while the gateway decides a charge. */
  @Post('workspaces/:workspaceId/billing/plan')
  async changePlan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Body(new ZodPipe(changePlanRequestSchema)) body: ChangePlanRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BillingSummary> {
    const outcome = await this.billing.changePlan(user, workspaceId, body);
    response.status(outcome.pending ? 202 : 200);
    return outcome.summary;
  }

  /** Drops the change scheduled for the end of the period (T3). */
  @Delete('workspaces/:workspaceId/billing/plan/scheduled-change')
  cancelScheduledChange(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ): Promise<BillingSummary> {
    return this.billing.cancelScheduledChange(user, workspaceId);
  }

  /** "Hủy gói" (T3): the plan stops at the end of the period. */
  @Post('workspaces/:workspaceId/billing/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ): Promise<BillingSummary> {
    return this.billing.cancel(user, workspaceId);
  }

  /** "Giữ lại gói" (T3). */
  @Post('workspaces/:workspaceId/billing/keep')
  @HttpCode(200)
  keep(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ): Promise<BillingSummary> {
    return this.billing.keep(user, workspaceId);
  }
}
