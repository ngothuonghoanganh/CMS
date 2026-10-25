import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
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

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @InjectEnv() private readonly env: Env,
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('signup')
  async signup(
    @Body(new ZodPipe(signupRequestSchema)) body: SignupRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MeResponse> {
    return this.withCookie(response, await this.auth.signup(body));
  }

  @Public()
  @UseGuards(ThrottlerGuard)
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
    const cookies: unknown = request.cookies;
    const token =
      typeof cookies === 'object' && cookies !== null && SESSION_COOKIE in cookies
        ? (cookies as Record<string, unknown>)[SESSION_COOKIE]
        : undefined;
    await this.auth.logout(typeof token === 'string' ? token : undefined);
    response.clearCookie(SESSION_COOKIE, this.cookieOptions());
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
    return session.me;
  }

  private cookieOptions() {
    return { httpOnly: true, sameSite: 'lax', secure: this.env.COOKIE_SECURE, path: '/' } as const;
  }
}
