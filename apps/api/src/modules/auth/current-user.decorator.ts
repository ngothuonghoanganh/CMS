import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from './authenticated-user.js';

export interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
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
