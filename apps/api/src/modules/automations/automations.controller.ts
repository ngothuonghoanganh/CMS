import { Body, Controller, Get, Header, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
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
}
