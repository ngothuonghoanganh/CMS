import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { EmailModule } from '../notifications/email.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import {
  AUTH_EMAIL_LIMIT_MODEL,
  authEmailLimitSchema,
  PASSWORD_RESET_MODEL,
  passwordResetSchema,
  PENDING_SIGNUP_MODEL,
  pendingSignupSchema,
} from './account.schema.js';
import { AccountEmails } from './account-emails.js';
import { AuthEmailLimitsRepository } from './auth-email-limits.repository.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { LoginAttemptsRepository } from './login-attempts.repository.js';
import { PasswordAttempts } from './password-attempts.js';
import { PasswordResetsRepository } from './password-resets.repository.js';
import { PasswordService } from './password.service.js';
import { PendingSignupsRepository } from './pending-signups.repository.js';
import { SessionGuard } from './session.guard.js';
import { SessionsRepository } from './sessions.repository.js';
import { SignupService } from './signup.service.js';
import {
  LOGIN_ATTEMPT_MODEL,
  loginAttemptSchema,
  SESSION_MODEL,
  sessionSchema,
  USER_MODEL,
  userSchema,
} from './user.schema.js';
import { UsersRepository } from './users.repository.js';

@Module({
  imports: [
    WorkspacesModule,
    EmailModule,
    MongooseModule.forFeature([
      { name: USER_MODEL, schema: userSchema },
      { name: SESSION_MODEL, schema: sessionSchema },
      { name: LOGIN_ATTEMPT_MODEL, schema: loginAttemptSchema },
      { name: PENDING_SIGNUP_MODEL, schema: pendingSignupSchema },
      { name: PASSWORD_RESET_MODEL, schema: passwordResetSchema },
      { name: AUTH_EMAIL_LIMIT_MODEL, schema: authEmailLimitSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SignupService,
    PasswordService,
    PasswordAttempts,
    AccountEmails,
    UsersRepository,
    SessionsRepository,
    LoginAttemptsRepository,
    PendingSignupsRepository,
    PasswordResetsRepository,
    AuthEmailLimitsRepository,
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
  exports: [UsersRepository],
})
export class AuthModule {}
