import { Body, Controller, Get, Header, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  type AutomationRunDetail,
  type AutomationRunListResponse,
  automationRunListQuerySchema,
  type RetryRunsResponse,
  type RevealedSecret,
  type RotateWebhookSecretRequest,
  rotateWebhookSecretRequestSchema,
  type AutomationActivation,
  type AutomationDetail,
  type AutomationListItem,
  type AutomationListResponse,
  type CreateAutomationRequest,
  createAutomationRequestSchema,
  type SetAutomationStateRequest,
  setAutomationStateRequestSchema,
  type TestAutomationRequest,
  testAutomationRequestSchema,
  type TestAutomationResponse,
  updateAutomationRequestSchema,
} from '@plp/contracts';
import type { z } from 'zod';
import { ZodPipe } from '../../shared/zod.pipe.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AutomationsService, type UpdateAutomationValues } from './automations.service.js';

/** The automations of a site (board 25, ADR-034). */
@Controller()
export class AutomationsController {
  constructor(private readonly automations: AutomationsService) {}

  @Get('sites/:siteId/automations')
  @Header('Cache-Control', 'no-store')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
  ): Promise<AutomationListResponse> {
    return this.automations.list(user, siteId);
  }

  @Post('sites/:siteId/automations')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Body(new ZodPipe(createAutomationRequestSchema)) body: CreateAutomationRequest,
  ): Promise<AutomationListItem> {
    return this.automations.create(user, siteId, body);
  }

  @Post('sites/:siteId/automations/:automationId/state')
  @HttpCode(200)
  setState(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('automationId') automationId: string,
    @Body(new ZodPipe(setAutomationStateRequestSchema)) body: SetAutomationStateRequest,
  ): Promise<AutomationListItem> {
    return this.automations.setState(user, siteId, automationId, body);
  }

  @Post('sites/:siteId/automations/:automationId/duplicate')
  duplicate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('automationId') automationId: string,
  ): Promise<AutomationListItem> {
    return this.automations.duplicate(user, siteId, automationId);
  }

  @Get('sites/:siteId/automations/:automationId')
  @Header('Cache-Control', 'no-store')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('automationId') automationId: string,
  ): Promise<AutomationDetail> {
    return this.automations.detail(user, siteId, automationId);
  }

  @Patch('sites/:siteId/automations/:automationId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('automationId') automationId: string,
    @Body(new ZodPipe(updateAutomationRequestSchema)) body: UpdateAutomationValues,
  ): Promise<AutomationDetail> {
    return this.automations.update(user, siteId, automationId, body);
  }

  @Post('sites/:siteId/automations/:automationId/test')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  test(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('automationId') automationId: string,
    @Body(new ZodPipe(testAutomationRequestSchema)) body: TestAutomationRequest,
  ): Promise<TestAutomationResponse> {
    return this.automations.test(user, siteId, automationId, body);
  }

  @Get('sites/:siteId/automations/:automationId/activation')
  @Header('Cache-Control', 'no-store')
  activation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('automationId') automationId: string,
  ): Promise<AutomationActivation> {
    return this.automations.activation(user, siteId, automationId);
  }

  @Post('sites/:siteId/automations/:automationId/webhook-secret')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  rotateSecret(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('automationId') automationId: string,
    @Body(new ZodPipe(rotateWebhookSecretRequestSchema)) body: RotateWebhookSecretRequest,
  ): Promise<RevealedSecret> {
    return this.automations.rotateSecret(user, siteId, automationId, body);
  }

  @Get('sites/:siteId/automations/:automationId/runs')
  @Header('Cache-Control', 'no-store')
  runs(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('automationId') automationId: string,
    @Query(new ZodPipe(automationRunListQuerySchema))
    query: z.output<typeof automationRunListQuerySchema>,
  ): Promise<AutomationRunListResponse> {
    return this.automations.listRuns(user, siteId, automationId, query.status, query.cursor);
  }

  @Post('sites/:siteId/automations/:automationId/runs/retry-failed')
  @HttpCode(200)
  retryFailed(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('automationId') automationId: string,
  ): Promise<RetryRunsResponse> {
    return this.automations.retryFailed(user, siteId, automationId);
  }

  @Get('sites/:siteId/automations/:automationId/runs/:runId')
  @Header('Cache-Control', 'no-store')
  run(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('automationId') automationId: string,
    @Param('runId') runId: string,
  ): Promise<AutomationRunDetail> {
    return this.automations.run(user, siteId, automationId, runId);
  }

  @Post('sites/:siteId/automations/:automationId/runs/:runId/retry')
  @HttpCode(200)
  retryRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('automationId') automationId: string,
    @Param('runId') runId: string,
  ): Promise<AutomationRunDetail> {
    return this.automations.retryRun(user, siteId, automationId, runId);
  }

  @Post('sites/:siteId/automations/:automationId/runs/:runId/skip')
  @HttpCode(200)
  skipRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('automationId') automationId: string,
    @Param('runId') runId: string,
  ): Promise<AutomationRunDetail> {
    return this.automations.skipRun(user, siteId, automationId, runId);
  }
}
