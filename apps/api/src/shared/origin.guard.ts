import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Env } from '../config/env.js';
import { InjectEnv } from './env.js';
import { AppError } from './errors.js';
import { SIGNED_BY_RENDERER } from './renderer-channel/renderer-request.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection for the cookie session: a state-changing request must come from the admin
 * origin. Browsers always send `Origin` on cross-site POST/PUT/PATCH/DELETE requests.
 *
 * Routes the renderer calls for visitors (`@RendererRequest()`) carry no session and no Origin;
 * their own guard requires the renderer's signature instead (ADR-016). The metadata always comes
 * with that guard, so no route can skip this check without a signature.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowedOrigin: string;

  constructor(
    @InjectEnv() env: Env,
    private readonly reflector: Reflector,
  ) {
    this.allowedOrigin = new URL(env.ADMIN_ORIGIN).origin;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) {
      return true;
    }
    const signed = this.reflector.getAllAndOverride<boolean | undefined>(SIGNED_BY_RENDERER, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (signed === true) {
      return true;
    }
    if (request.headers.origin !== this.allowedOrigin) {
      throw new AppError(
        403,
        'origin_rejected',
        'Yêu cầu bị từ chối vì không đến từ trang quản trị',
      );
    }
    return true;
  }
}
