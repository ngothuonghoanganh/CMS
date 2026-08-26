import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AssignMemberRoleRequestSchema,
  CreateTenantUserRequestSchema,
  TenantUserListQuerySchema,
  UpdateTenantUserRequestSchema,
  type AssignMemberRoleRequest,
  type CreateTenantUserRequest,
  type TenantUserListQuery,
  type UpdateTenantUserRequest,
} from '@payload/contracts';

import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { AuthenticationGuard } from '../common/guards/authentication.guard';
import type { PlatformRequest } from '../common/interfaces/request';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RoleService } from './role.service';
import { UserService } from './user.service';

@Controller('users')
@UseGuards(AuthenticationGuard)
export class UserController {
  constructor(
    @Inject(UserService) private readonly users: UserService,
    @Inject(RoleService) private readonly roles: RoleService,
  ) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(TenantUserListQuerySchema)) query: TenantUserListQuery,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.users.list(principal, query);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateTenantUserRequestSchema))
    input: CreateTenantUserRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.users.create(principal, input);
  }

  @Get(':userId')
  get(
    @Param('userId') userId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.users.get(principal, userId);
  }

  @Patch(':userId')
  update(
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(UpdateTenantUserRequestSchema))
    input: UpdateTenantUserRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.users.update(principal, userId, input);
  }

  @Post(':userId/disable')
  disable(
    @Param('userId') userId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.users.setStatus(principal, userId, 'disabled');
  }

  @Post(':userId/enable')
  enable(
    @Param('userId') userId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.users.setStatus(principal, userId, 'active');
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('userId') userId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.users.remove(principal, userId);
  }

  @Get(':userId/role-assignments')
  async listRoleAssignments(
    @Param('userId') userId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    const email = await this.users.emailForId(userId);
    return this.roles.listAssignments(email, principal, 'user.read');
  }

  @Post(':userId/role-assignments')
  async assignRole(
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(AssignMemberRoleRequestSchema))
    input: AssignMemberRoleRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    const email = await this.users.emailForId(userId);
    return this.roles.assign(principal, { ...input, userId: email });
  }

  @Delete(':userId/role-assignments/:assignmentId')
  removeRoleAssignment(
    @Param('userId') userId: string,
    @Param('assignmentId') assignmentId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.users.removeRoleAssignment(principal, userId, assignmentId);
  }
}
