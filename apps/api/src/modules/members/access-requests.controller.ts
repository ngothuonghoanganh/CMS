import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  type AccessGrant,
  accessGrantSchema,
  type AccessRequestListResponse,
  type CreateAccessRequest,
  createAccessRequestSchema,
  type Member,
  type MyAccessRequestResponse,
} from '@plp/contracts';
import { ZodPipe } from '../../shared/zod.pipe.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AccessRequestsService } from './access-requests.service.js';

@Controller('workspaces/:workspaceId/access-requests')
export class AccessRequestsController {
  constructor(private readonly requests: AccessRequestsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ): Promise<AccessRequestListResponse> {
    return this.requests.list(user, workspaceId);
  }

  @Get('mine')
  mine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ): Promise<MyAccessRequestResponse> {
    return this.requests.mine(user, workspaceId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Body(new ZodPipe(createAccessRequestSchema)) body: CreateAccessRequest,
  ): Promise<MyAccessRequestResponse> {
    return this.requests.create(user, workspaceId, body);
  }

  @Post(':requestId/accept')
  @HttpCode(200)
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('requestId') requestId: string,
    @Body(new ZodPipe(accessGrantSchema)) body: AccessGrant,
  ): Promise<Member> {
    return this.requests.accept(user, workspaceId, requestId, body);
  }

  @Post(':requestId/decline')
  @HttpCode(204)
  decline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('requestId') requestId: string,
  ): Promise<void> {
    return this.requests.decline(user, workspaceId, requestId);
  }
}
