import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  WorkspaceRecord,
  WorkspaceSchema,
} from '../persistence/schemas/workspace.schema';
import { DemoWorkspaceBootstrap } from './demo-workspace.bootstrap';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: WorkspaceRecord.name, schema: WorkspaceSchema }]),
  ],
  providers: [DemoWorkspaceBootstrap],
})
export class BootstrapModule {}
