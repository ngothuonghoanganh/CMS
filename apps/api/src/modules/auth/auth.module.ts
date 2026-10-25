import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SessionGuard } from './session.guard.js';
import { SessionsRepository } from './sessions.repository.js';
import { SESSION_MODEL, sessionSchema, USER_MODEL, userSchema } from './user.schema.js';
import { UsersRepository } from './users.repository.js';

@Module({
  imports: [
    WorkspacesModule,
    MongooseModule.forFeature([
      { name: USER_MODEL, schema: userSchema },
      { name: SESSION_MODEL, schema: sessionSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    UsersRepository,
    SessionsRepository,
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
  exports: [UsersRepository],
})
export class AuthModule {}
