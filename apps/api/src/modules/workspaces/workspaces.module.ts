import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ACCESS_REQUEST_MODEL, accessRequestSchema } from './access-request.schema.js';
import { AccessRequestsRepository } from './access-requests.repository.js';
import { AccessService } from './access.service.js';
import { CUSTOM_ROLE_MODEL, customRoleSchema } from './custom-role.schema.js';
import { CustomRolesRepository } from './custom-roles.repository.js';
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
import { WorkspaceIndexBuilder } from './workspace-index-builder.js';
import { WorkspaceLinks } from './workspace-links.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WORKSPACE_MODEL, schema: workspaceSchema },
      { name: MEMBERSHIP_MODEL, schema: membershipSchema },
      { name: INVITATION_MODEL, schema: invitationSchema },
      { name: ACCESS_REQUEST_MODEL, schema: accessRequestSchema },
      { name: CUSTOM_ROLE_MODEL, schema: customRoleSchema },
    ]),
  ],
  providers: [
    WorkspaceIndexBuilder,
    WorkspaceLinks,
    WorkspacesRepository,
    InvitationsRepository,
    AccessRequestsRepository,
    AccessService,
    CustomRolesRepository,
    WorkspaceJoin,
  ],
  exports: [
    WorkspaceLinks,
    WorkspacesRepository,
    InvitationsRepository,
    AccessRequestsRepository,
    AccessService,
    CustomRolesRepository,
    WorkspaceJoin,
  ],
})
export class WorkspacesModule {}
