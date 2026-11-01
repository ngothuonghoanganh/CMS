import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  type CustomRole,
  type CustomRoleInput,
  customRoleInputSchema,
  type CustomRoleListResponse,
} from '@plp/contracts';
import { ZodPipe } from '../../shared/zod.pipe.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { CustomRolesService } from './custom-roles.service.js';

/** Custom roles of a workspace (board 16, ADR-024); `members.manage`. */
@Controller('workspaces/:workspaceId/custom-roles')
export class CustomRolesController {
  constructor(private readonly roles: CustomRolesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ): Promise<CustomRoleListResponse> {
    return this.roles.list(user, workspaceId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Body(new ZodPipe(customRoleInputSchema)) body: CustomRoleInput,
  ): Promise<CustomRole> {
    return this.roles.create(user, workspaceId, body);
  }

  @Patch(':roleId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('roleId') roleId: string,
    @Body(new ZodPipe(customRoleInputSchema)) body: CustomRoleInput,
  ): Promise<CustomRole> {
    return this.roles.update(user, workspaceId, roleId, body);
  }

  @Delete(':roleId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('roleId') roleId: string,
  ): Promise<void> {
    return this.roles.remove(user, workspaceId, roleId);
  }
}
