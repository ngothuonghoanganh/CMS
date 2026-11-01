import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import {
  type AcceptInvitationResponse,
  createInvitationsRequestSchema,
  type CreateInvitationsResponse,
  type Invitation,
  type InvitationListResponse,
  type InvitationLookupResponse,
  type InvitationTokenRequest,
  invitationTokenRequestSchema,
} from '@plp/contracts';
import type { z } from 'zod';
import { ZodPipe } from '../../shared/zod.pipe.js';
import { AuthThrottlerGuard } from '../auth/auth-throttler.guard.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Public } from '../auth/public.decorator.js';
import { InvitationsService } from './invitations.service.js';

type CreateInvitationsValues = z.output<typeof createInvitationsRequestSchema>;

@Controller()
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get('workspaces/:workspaceId/invitations')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ): Promise<InvitationListResponse> {
    return this.invitations.list(user, workspaceId);
  }

  @Post('workspaces/:workspaceId/invitations')
  @HttpCode(200)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Body(new ZodPipe(createInvitationsRequestSchema)) body: CreateInvitationsValues,
  ): Promise<CreateInvitationsResponse> {
    return this.invitations.create(user, workspaceId, body);
  }

  @Post('workspaces/:workspaceId/invitations/:invitationId/resend')
  @HttpCode(200)
  resend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('invitationId') invitationId: string,
  ): Promise<Invitation> {
    return this.invitations.resend(user, workspaceId, invitationId);
  }

  @Delete('workspaces/:workspaceId/invitations/:invitationId')
  @HttpCode(204)
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('invitationId') invitationId: string,
  ): Promise<void> {
    return this.invitations.revoke(user, workspaceId, invitationId);
  }

  @Public()
  @UseGuards(AuthThrottlerGuard)
  @Post('public/invitations/lookup')
  @HttpCode(200)
  lookup(
    @Body(new ZodPipe(invitationTokenRequestSchema)) body: InvitationTokenRequest,
  ): Promise<InvitationLookupResponse> {
    return this.invitations.lookup(body.token);
  }

  @Post('invitations/accept')
  @HttpCode(200)
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodPipe(invitationTokenRequestSchema)) body: InvitationTokenRequest,
  ): Promise<AcceptInvitationResponse> {
    return this.invitations.accept(user, body.token);
  }

  @Post('invitations/decline')
  @HttpCode(204)
  decline(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodPipe(invitationTokenRequestSchema)) body: InvitationTokenRequest,
  ): Promise<void> {
    return this.invitations.decline(user, body.token);
  }
}
