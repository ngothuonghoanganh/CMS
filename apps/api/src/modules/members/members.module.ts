import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EmailModule } from '../notifications/email.module.js';
import { SitesCoreModule } from '../sites/sites-core.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { AccessRequestsController } from './access-requests.controller.js';
import { AccessRequestsService } from './access-requests.service.js';
import { InvitationsController } from './invitations.controller.js';
import { InvitationsService } from './invitations.service.js';
import { MemberGrants } from './member-grants.js';
import { MembersController } from './members.controller.js';
import { MembersService } from './members.service.js';

/** Members, invitations, access requests and the ownership of a workspace (ADR-021). */
@Module({
  imports: [AuthModule, EmailModule, SitesCoreModule, WorkspacesModule],
  controllers: [MembersController, InvitationsController, AccessRequestsController],
  providers: [MemberGrants, MembersService, InvitationsService, AccessRequestsService],
})
export class MembersModule {}
