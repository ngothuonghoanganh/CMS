import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  LoginRequestSchema,
  type AuthSessionResponse,
  type LoginRequest,
} from '@payload/contracts';

import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { AuthenticationGuard } from '../common/guards/authentication.guard';
import { AuthenticationService } from '../common/guards/authentication.service';
import type { PlatformRequest } from '../common/interfaces/request';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { env } from '../config/env';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthenticationService)
    private readonly authenticationService: AuthenticationService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(LoginRequestSchema)) input: LoginRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionResponse> {
    const result = await this.authenticationService.login(input);
    this.setAuthCookies(response, result.accessToken, result.refreshToken);
    return result.response;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionResponse> {
    const result = await this.authenticationService.refresh(
      this.readCookie(request, this.authenticationService.refreshTokenCookieName),
    );
    this.setAuthCookies(response, result.accessToken, result.refreshToken);
    return result.response;
  }

  @Get('me')
  @UseGuards(AuthenticationGuard)
  async me(
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ): Promise<AuthSessionResponse> {
    if (!principal) {
      throw new Error('Authentication guard did not attach a principal');
    }
    return this.authenticationService.getSessionResponse(principal);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authenticationService.logout(
      this.readCookie(request, this.authenticationService.accessTokenCookieName),
      this.readCookie(request, this.authenticationService.refreshTokenCookieName),
    );
    this.clearAuthCookies(response);
  }

  private setAuthCookies(
    response: Response,
    accessToken: string,
    refreshToken: string,
  ): void {
    response.setHeader('Set-Cookie', [
      this.cookie(
        this.authenticationService.accessTokenCookieName,
        accessToken,
        env.AUTH_ACCESS_TOKEN_TTL_SECONDS,
      ),
      this.cookie(
        this.authenticationService.refreshTokenCookieName,
        refreshToken,
        env.AUTH_REFRESH_TOKEN_TTL_SECONDS,
      ),
    ]);
  }

  private clearAuthCookies(response: Response): void {
    const expired = 'Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0';
    response.setHeader('Set-Cookie', [
      this.cookie(this.authenticationService.accessTokenCookieName, '', 0, expired),
      this.cookie(this.authenticationService.refreshTokenCookieName, '', 0, expired),
    ]);
  }

  private cookie(name: string, value: string, maxAge: number, extra = ''): string {
    const secure = env.NODE_ENV === 'production' ? '; Secure' : '';
    return `${name}=${encodeURIComponent(value)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${extra ? `; ${extra}` : ''}${secure}`;
  }

  private readCookie(request: Request, name: string): string | undefined {
    const cookiePrefix = `${name}=`;
    const cookie = request
      .header('cookie')
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(cookiePrefix));
    if (!cookie) {
      return undefined;
    }

    try {
      return decodeURIComponent(cookie.slice(cookiePrefix.length));
    } catch {
      return undefined;
    }
  }
}
