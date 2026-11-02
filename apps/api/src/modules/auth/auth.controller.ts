import { Body, Controller, Get, HttpCode, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthThrottlerGuard } from './auth-throttler.guard.js';
import {
  type AccountEmailRequest,
  accountEmailRequestSchema,
  type AccountEmailResponse,
  type ChangePasswordRequest,
  changePasswordRequestSchema,
  type InvitedSignupRequest,
  invitedSignupRequestSchema,
  type LoginRequest,
  loginRequestSchema,
  type MeResponse,
  type ResetPasswordRequest,
  resetPasswordRequestSchema,
  SESSION_COOKIE,
  type SignupLookupRequest,
  signupLookupRequestSchema,
  type SignupLookupResponse,
  type SignupRequest,
  signupRequestSchema,
  type SignupVerifyRequest,
  signupVerifyRequestSchema,
  type UpdateMeRequest,
  updateMeRequestSchema,
} from '@plp/contracts';
import type { Request, Response } from 'express';
import type { Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import { ZodPipe } from '../../shared/zod.pipe.js';
import { AuthService, type IssuedSession } from './auth.service.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import { CurrentSessionId, CurrentUser } from './current-user.decorator.js';
import { PasswordService } from './password.service.js';
import { Public } from './public.decorator.js';
import { sessionTokensOf } from './session-cookie.js';
import { SignupService } from './signup.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly signups: SignupService,
    private readonly passwords: PasswordService,
    @InjectEnv() private readonly env: Env,
  ) {}

  /** Emails a confirmation link; nothing is created until it is used (ADR-026). */
  @Public()
  @UseGuards(AuthThrottlerGuard)
  @Post('signup')
  @HttpCode(202)
  signup(
    @Body(new ZodPipe(signupRequestSchema)) body: SignupRequest,
  ): Promise<AccountEmailResponse> {
    return this.signups.start(body);
  }

  /** The confirmation link's page: the email it proves and the names to prefill. */
  @Public()
  @UseGuards(AuthThrottlerGuard)
  @Post('signup/lookup')
  @HttpCode(200)
  lookupSignup(
    @Body(new ZodPipe(signupLookupRequestSchema)) body: SignupLookupRequest,
  ): Promise<SignupLookupResponse> {
    return this.signups.lookup(body);
  }

  /**
   * From the confirmation link, with the password chosen on its page: the account, its workspace,
   * and a session.
   */
  @Public()
  @UseGuards(AuthThrottlerGuard)
  @Post('signup/verify')
  async verifySignup(
    @Body(new ZodPipe(signupVerifyRequestSchema)) body: SignupVerifyRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MeResponse> {
    return this.withCookie(response, await this.signups.verify(body));
  }

  @Public()
  @UseGuards(AuthThrottlerGuard)
  @Post('signup/resend')
  @HttpCode(202)
  resendSignup(
    @Body(new ZodPipe(accountEmailRequestSchema)) body: AccountEmailRequest,
  ): Promise<AccountEmailResponse> {
    return this.signups.resend(body);
  }

  /** From an invitation link: the invited email's account, already in the workspace. */
  @Public()
  @UseGuards(AuthThrottlerGuard)
  @Post('signup/invited')
  async signupInvited(
    @Body(new ZodPipe(invitedSignupRequestSchema)) body: InvitedSignupRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MeResponse> {
    return this.withCookie(response, await this.auth.signupInvited(body));
  }

  @Public()
  @UseGuards(AuthThrottlerGuard)
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(loginRequestSchema)) body: LoginRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MeResponse> {
    return this.withCookie(response, await this.auth.login(body));
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(sessionTokensOf(request));
    // With workspace addresses, both scopes: a host-only cookie from before them would otherwise
    // outlive the sign-out. Without them the parent domain is unknown; its sessions are ended
    // above and refused in this mode anyway (ADR-025).
    response.clearCookie(SESSION_COOKIE, this.cookieOptions());
    if (this.env.SESSION_COOKIE_DOMAIN !== undefined) {
      response.clearCookie(SESSION_COOKIE, this.hostOnlyOptions());
    }
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<MeResponse> {
    return this.auth.me(user);
  }

  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodPipe(updateMeRequestSchema)) body: UpdateMeRequest,
  ): Promise<MeResponse> {
    return this.auth.updateName(user, body.name);
  }

  @Public()
  @UseGuards(AuthThrottlerGuard)
  @Post('password/forgot')
  @HttpCode(202)
  forgotPassword(
    @Body(new ZodPipe(accountEmailRequestSchema)) body: AccountEmailRequest,
  ): Promise<AccountEmailResponse> {
    return this.passwords.forgot(body);
  }

  /** From the reset link: every session ends, then the user is signed in again. */
  @Public()
  @UseGuards(AuthThrottlerGuard)
  @Post('password/reset')
  @HttpCode(200)
  async resetPassword(
    @Body(new ZodPipe(resetPasswordRequestSchema)) body: ResetPasswordRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MeResponse> {
    return this.withCookie(response, await this.passwords.reset(body));
  }

  /** The signed-in user's password; this session stays, the others end. */
  @UseGuards(AuthThrottlerGuard)
  @Post('password')
  @HttpCode(204)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSessionId() sessionId: ObjectId,
    @Body(new ZodPipe(changePasswordRequestSchema)) body: ChangePasswordRequest,
  ): Promise<void> {
    await this.passwords.change(user, sessionId, body);
  }

  private withCookie(response: Response, session: IssuedSession): MeResponse {
    response.cookie(SESSION_COOKIE, session.token, {
      ...this.cookieOptions(),
      expires: session.expiresAt,
    });
    // A host-only cookie of the same name, from before workspace addresses, would shadow the new
    // one on this host (ADR-025).
    if (this.env.SESSION_COOKIE_DOMAIN !== undefined) {
      response.clearCookie(SESSION_COOKIE, this.hostOnlyOptions());
    }
    return session.me;
  }

  private hostOnlyOptions() {
    return { httpOnly: true, sameSite: 'lax', secure: this.env.COOKIE_SECURE, path: '/' } as const;
  }

  /** With workspace addresses, on their parent domain: one login serves them all (ADR-025). */
  private cookieOptions() {
    return {
      ...this.hostOnlyOptions(),
      ...(this.env.SESSION_COOKIE_DOMAIN === undefined
        ? {}
        : { domain: this.env.SESSION_COOKIE_DOMAIN }),
    } as const;
  }
}
