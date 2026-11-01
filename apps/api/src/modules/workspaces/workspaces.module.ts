import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccessService } from './access.service.js';
import { MembersService } from './members.service.js';
import {
  MEMBERSHIP_MODEL,
  WORKSPACE_MODEL,
  membershipSchema,
  workspaceSchema,
} from './workspace.schema.js';
import { WorkspacesController } from './workspaces.controller.js';
import { WorkspacesRepository } from './workspaces.repository.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WORKSPACE_MODEL, schema: workspaceSchema },
      { name: MEMBERSHIP_MODEL, schema: membershipSchema },
    ]),
  ],
  controllers: [WorkspacesController],
  providers: [WorkspacesRepository, AccessService, MembersService],
  exports: [WorkspacesRepository, AccessService],
})
export class WorkspacesModule {}
