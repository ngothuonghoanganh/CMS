import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  type AddLeadRecipientRequest,
  addLeadRecipientRequestSchema,
  type ConfirmLeadRecipientRequest,
  confirmLeadRecipientRequestSchema,
  type ConfirmLeadRecipientResponse,
  type LeadRecipient,
  type LeadRecipientListResponse,
} from '@plp/contracts';
import { ZodPipe } from '../../shared/zod.pipe.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Public } from '../auth/public.decorator.js';
import { LeadRecipientsService } from './lead-recipients.service.js';

/** "Nơi nhận lead" (ADR-018): members read, the owner changes; anyone with a link confirms it. */
@Controller()
export class LeadRecipientsController {
  constructor(private readonly recipients: LeadRecipientsService) {}

  @Get('sites/:siteId/lead-recipients')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
  ): Promise<LeadRecipientListResponse> {
    return this.recipients.list(user, siteId);
  }

  @Post('sites/:siteId/lead-recipients')
  add(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Body(new ZodPipe(addLeadRecipientRequestSchema)) body: AddLeadRecipientRequest,
  ): Promise<LeadRecipient> {
    return this.recipients.add(user, siteId, body.email);
  }

  @Post('sites/:siteId/lead-recipients/:recipientId/resend')
  @HttpCode(200)
  resend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('recipientId') recipientId: string,
  ): Promise<LeadRecipient> {
    return this.recipients.resend(user, siteId, recipientId);
  }

  @Delete('sites/:siteId/lead-recipients/:recipientId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('recipientId') recipientId: string,
  ): Promise<void> {
    return this.recipients.remove(user, siteId, recipientId);
  }

  /** No session: the confirmation page of the admin posts the link's secret. */
  @Public()
  @Post('public/lead-recipients/confirm')
  @HttpCode(200)
  confirm(
    @Body(new ZodPipe(confirmLeadRecipientRequestSchema)) body: ConfirmLeadRecipientRequest,
  ): Promise<ConfirmLeadRecipientResponse> {
    return this.recipients.confirm(body.token);
  }
}
