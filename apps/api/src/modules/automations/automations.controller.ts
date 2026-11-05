import { Body, Controller, Get, Header, HttpCode, Param, Post } from '@nestjs/common';
import {
  type AutomationListItem,
  type AutomationListResponse,
  type CreateAutomationRequest,
  createAutomationRequestSchema,
  type SetAutomationStateRequest,
  setAutomationStateRequestSchema,
} from '@plp/contracts';
import { ZodPipe } from '../../shared/zod.pipe.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AutomationsService } from './automations.service.js';

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
}
