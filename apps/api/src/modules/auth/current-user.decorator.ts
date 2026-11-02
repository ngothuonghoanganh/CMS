import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { AuthenticatedUser } from './authenticated-user.js';

export interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
  /** The session the request came with. */
  sessionId?: ObjectId;
}

/** The signed-in user; only valid on routes protected by the session guard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (!user) {
      throw new Error('CurrentUser used on a route without an authenticated user');
    }
    return user;
  },
);

/** The id of the request's session, e.g. the one a password change keeps (ADR-026). */
export const CurrentSessionId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ObjectId => {
    const sessionId = context.switchToHttp().getRequest<RequestWithUser>().sessionId;
    if (!sessionId) {
      throw new Error('CurrentSessionId used on a route without a session');
    }
    return sessionId;
  },
);
