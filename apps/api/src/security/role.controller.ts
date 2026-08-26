import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AssignMemberRoleRequestSchema,
  AssignRoleRequestSchema,
  CreateRoleRequestSchema,
  EntityIdSchema,
  UpdateRoleRequestSchema,
  type AssignRoleRequest,
  type CreateRoleRequest,
  type UpdateRoleRequest,
} from '@payload/contracts';

import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { AuthenticationGuard } from '../common/guards/authentication.guard';
import type { PlatformRequest } from '../common/interfaces/request';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RoleService } from './role.service';

@Controller()
@UseGuards(AuthenticationGuard)
export class RoleController {
  constructor(@Inject(RoleService) private readonly roles: RoleService) {}

  @Get('roles')
  list(@CurrentPrincipal() principal: PlatformRequest['auth']) {
    return this.roles.list(principal);
  }

  @Post('roles')
  create(
    @Body(new ZodValidationPipe(CreateRoleRequestSchema)) input: CreateRoleRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.roles.create(principal, input);
  }

  @Get('roles/:roleId')
  get(
    @Param('roleId') roleId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.roles.get(roleId, principal);
  }

  @Patch('roles/:roleId')
  update(
    @Param('roleId') roleId: string,
    @Body(new ZodValidationPipe(UpdateRoleRequestSchema)) input: UpdateRoleRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.roles.update(principal, roleId, input);
  }

  @Delete('roles/:roleId')
  remove(
    @Param('roleId') roleId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.roles.remove(principal, roleId);
  }

  @Get('role-assignments')
  listAssignments(
    @Query('userId') userId: string | undefined,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.roles.listAssignments(userId, principal);
  }

  @Get('members/:userId/roles')
  listMemberAssignments(
    @Param('userId') userId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.roles.listAssignments(userId, principal);
  }

  @Post('role-assignments')
  assign(
    @Body(new ZodValidationPipe(AssignRoleRequestSchema)) input: AssignRoleRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.roles.assign(principal, input);
  }

  @Post('members/:userId/roles')
  assignMember(
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(AssignMemberRoleRequestSchema))
    input: Omit<AssignRoleRequest, 'userId'>,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.roles.assign(principal, { ...input, userId });
  }

  @Delete('role-assignments/:assignmentId')
  removeAssignment(
    @Param('assignmentId') assignmentId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.roles.removeAssignment(principal, assignmentId);
  }

  @Delete('members/:userId/roles/:assignmentId')
  removeMemberAssignment(
    @Param('assignmentId') assignmentId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.roles.removeAssignment(principal, assignmentId);
  }

  @Get('me/permissions')
  permissions(
    @Query('workspaceId') workspaceId: string | undefined,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.roles.currentPermissions(
      principal,
      workspaceId && EntityIdSchema.safeParse(workspaceId).success
        ? workspaceId
        : undefined,
    );
  }
}
