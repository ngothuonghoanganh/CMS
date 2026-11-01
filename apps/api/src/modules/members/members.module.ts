import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EmailModule } from '../notifications/email.module.js';
import { SitesCoreModule } from '../sites/sites-core.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { AccessRequestsController } from './access-requests.controller.js';
import { AccessRequestsService } from './access-requests.service.js';
import { CustomRolesController } from './custom-roles.controller.js';
import { CustomRolesService } from './custom-roles.service.js';
import { InvitationsController } from './invitations.controller.js';
import { InvitationsService } from './invitations.service.js';
import { MemberGrants } from './member-grants.js';
import { MembersController } from './members.controller.js';
import { MembersService } from './members.service.js';

/** Members, invitations, access requests, custom roles and the ownership (ADR-021, ADR-024). */
@Module({
  imports: [AuthModule, EmailModule, SitesCoreModule, WorkspacesModule],
  controllers: [
    MembersController,
    InvitationsController,
    AccessRequestsController,
    CustomRolesController,
  ],
  providers: [
    MemberGrants,
    MembersService,
    InvitationsService,
    AccessRequestsService,
    CustomRolesService,
  ],
})
export class MembersModule {}
