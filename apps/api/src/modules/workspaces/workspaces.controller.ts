import { Controller, Get, Param } from '@nestjs/common';
import type { RoleCounts } from '@plp/contracts';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { MembersService } from './members.service.js';

@Controller()
export class WorkspacesController {
  constructor(private readonly members: MembersService) {}

  @Get('workspaces/:workspaceId/role-counts')
  roleCounts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ): Promise<RoleCounts> {
    return this.members.roleCounts(user, workspaceId);
  }
}
