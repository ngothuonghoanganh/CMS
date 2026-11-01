import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  type AccessGrant,
  accessGrantSchema,
  type Member,
  type MemberListResponse,
  type RoleCounts,
  type TransferOwnershipRequest,
  transferOwnershipRequestSchema,
} from '@plp/contracts';
import { ZodPipe } from '../../shared/zod.pipe.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { MembersService } from './members.service.js';

@Controller('workspaces/:workspaceId')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get('role-counts')
  roleCounts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ): Promise<RoleCounts> {
    return this.members.roleCounts(user, workspaceId);
  }

  @Get('members')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ): Promise<MemberListResponse> {
    return this.members.list(user, workspaceId);
  }

  @Patch('members/:userId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('userId') userId: string,
    @Body(new ZodPipe(accessGrantSchema)) body: AccessGrant,
  ): Promise<Member> {
    return this.members.update(user, workspaceId, userId, body);
  }

  @Delete('members/:userId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    return this.members.remove(user, workspaceId, userId);
  }

  @Post('ownership')
  @HttpCode(200)
  transferOwnership(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Body(new ZodPipe(transferOwnershipRequestSchema)) body: TransferOwnershipRequest,
  ): Promise<MemberListResponse> {
    return this.members.transferOwnership(user, workspaceId, body);
  }
}
