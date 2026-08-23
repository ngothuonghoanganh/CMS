import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { AuthPrincipal } from '@payload/contracts';

import type { PlatformRequest } from '../interfaces/request';

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthPrincipal | undefined => {
    const request = context.switchToHttp().getRequest<PlatformRequest>();
    return request.auth;
  },
);
