import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppError } from '../../shared/errors.js';
import type { RequestWithUser } from './current-user.decorator.js';
import { IS_PUBLIC } from './public.decorator.js';
import { sessionTokensOf } from './session-cookie.js';
import { hashSessionToken } from './session-token.js';
import { SessionsRepository } from './sessions.repository.js';
import { UsersRepository } from './users.repository.js';

function unauthenticated(): AppError {
  return new AppError(401, 'unauthenticated', 'Bạn cần đăng nhập');
}

/** Global guard: every route needs a valid session cookie unless marked `@Public()`. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsRepository,
    private readonly users: UsersRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    // The first token that is still a session: a stale cookie of another scope may come first.
    const now = new Date();
    let session = null;
    for (const token of sessionTokensOf(request)) {
      session = await this.sessions.findActive(hashSessionToken(token), now);
      if (session) {
        break;
      }
    }
    if (!session) {
      throw unauthenticated();
    }
    const user = await this.users.findById(session.userId);
    if (!user) {
      throw unauthenticated();
    }
    request.user = { id: user._id, name: user.name, email: user.email };
    return true;
  }
}
