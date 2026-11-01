import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthThrottlerGuard } from './auth-throttler.guard.js';
import {
  type InvitedSignupRequest,
  invitedSignupRequestSchema,
  type LoginRequest,
  loginRequestSchema,
  type MeResponse,
  SESSION_COOKIE,
  type SignupRequest,
  signupRequestSchema,
} from '@plp/contracts';
import type { Request, Response } from 'express';
import type { Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import { ZodPipe } from '../../shared/zod.pipe.js';
import { AuthService, type IssuedSession } from './auth.service.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import { CurrentUser } from './current-user.decorator.js';
import { Public } from './public.decorator.js';
import { sessionTokensOf } from './session-cookie.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @InjectEnv() private readonly env: Env,
  ) {}

  @Public()
  @UseGuards(AuthThrottlerGuard)
  @Post('signup')
  async signup(
    @Body(new ZodPipe(signupRequestSchema)) body: SignupRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MeResponse> {
    return this.withCookie(response, await this.auth.signup(body));
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
    // Both scopes: a host-only cookie from before workspace addresses, or the other way round,
    // would otherwise outlive the sign-out (ADR-025).
    response.clearCookie(SESSION_COOKIE, this.cookieOptions());
    if (this.env.SESSION_COOKIE_DOMAIN !== undefined) {
      response.clearCookie(SESSION_COOKIE, this.hostOnlyOptions());
    }
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<MeResponse> {
    return this.auth.me(user);
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
