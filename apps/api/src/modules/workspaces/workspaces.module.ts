import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ACCESS_REQUEST_MODEL, accessRequestSchema } from './access-request.schema.js';
import { AccessRequestsRepository } from './access-requests.repository.js';
import { AccessService } from './access.service.js';
import { INVITATION_MODEL, invitationSchema } from './invitation.schema.js';
import { InvitationsRepository } from './invitations.repository.js';
import {
  MEMBERSHIP_MODEL,
  WORKSPACE_MODEL,
  membershipSchema,
  workspaceSchema,
} from './workspace.schema.js';
import { WorkspaceJoin } from './workspace-join.service.js';
import { WorkspacesRepository } from './workspaces.repository.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WORKSPACE_MODEL, schema: workspaceSchema },
      { name: MEMBERSHIP_MODEL, schema: membershipSchema },
      { name: INVITATION_MODEL, schema: invitationSchema },
      { name: ACCESS_REQUEST_MODEL, schema: accessRequestSchema },
    ]),
  ],
  providers: [
    WorkspacesRepository,
    InvitationsRepository,
    AccessRequestsRepository,
    AccessService,
    WorkspaceJoin,
  ],
  exports: [
    WorkspacesRepository,
    InvitationsRepository,
    AccessRequestsRepository,
    AccessService,
    WorkspaceJoin,
  ],
})
export class WorkspacesModule {}
