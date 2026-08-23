import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';

import type { PlatformRequest } from '../interfaces/request';
import { AuthenticationService } from './authentication.service';

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    @Inject(AuthenticationService)
    private readonly authenticationService: AuthenticationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PlatformRequest>();
    const token = this.readToken(request);

    try {
      request.auth = await this.authenticationService.authenticate(token);
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Authentication is required',
      });
    }
  }

  private readToken(request: PlatformRequest): string | undefined {
    const authorization = request.header('authorization');
    if (authorization?.toLowerCase().startsWith('bearer ')) {
      return authorization.slice(7).trim();
    }

    try {
      const cookieHeader = request.header('cookie');
      const cookiePrefix = `${this.authenticationService.accessTokenCookieName}=`;
      const cookie = cookieHeader
        ?.split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(cookiePrefix));

      return cookie ? decodeURIComponent(cookie.slice(cookiePrefix.length)) : undefined;
    } catch {
      return undefined;
    }
  }
}
