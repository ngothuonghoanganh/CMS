import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthenticationGuard } from './authentication.guard';
import { AuthenticationService } from './authentication.service';
import {
  AuthSessionRecord,
  AuthSessionSchema,
} from '../../persistence/schemas/auth-session.schema';
import {
  WorkspaceRecord,
  WorkspaceSchema,
} from '../../persistence/schemas/workspace.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorkspaceRecord.name, schema: WorkspaceSchema },
      { name: AuthSessionRecord.name, schema: AuthSessionSchema },
    ]),
  ],
  exports: [AuthenticationGuard, AuthenticationService],
  providers: [AuthenticationGuard, AuthenticationService],
})
export class AuthenticationModule {}
