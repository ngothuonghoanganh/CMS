import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { slugOfOrigin } from '@plp/contracts';
import type { Request } from 'express';
import type { Env } from '../config/env.js';
import { InjectEnv } from './env.js';
import { AppError } from './errors.js';
import { SIGNED_BY_PAYMENT_GATEWAY } from './payment-gateway-route.js';
import { SIGNED_BY_RENDERER } from './renderer-channel/renderer-request.js';

/** Methods that change nothing (RFC 9110): no Origin check, and allowed in a read-only workspace. */
export const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection for the cookie session: a state-changing request must come from the admin, at
 * its common address or a workspace's (ADR-025). Browsers always send `Origin` on cross-site
 * POST/PUT/PATCH/DELETE requests.
 *
 * Routes the renderer calls for visitors (`@RendererRequest()`) carry no session and no Origin;
 * their own guard requires the renderer's signature instead (ADR-016). So does the payment
 * gateway's webhook (`@PaymentGatewayWebhook()`, ADR-035), signed by the gateway. The metadata
 * always comes with that guard, so no route can skip this check without a signature.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowedOrigin: string;
  private readonly workspaceTemplate: string | undefined;

  constructor(
    @InjectEnv() env: Env,
    private readonly reflector: Reflector,
  ) {
    this.allowedOrigin = new URL(env.ADMIN_ORIGIN).origin;
    this.workspaceTemplate = env.ADMIN_WORKSPACE_ORIGIN_TEMPLATE;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) {
      return true;
    }
    const targets = [context.getHandler(), context.getClass()];
    const signed =
      this.reflector.getAllAndOverride<boolean | undefined>(SIGNED_BY_RENDERER, targets) === true ||
      this.reflector.getAllAndOverride<boolean | undefined>(SIGNED_BY_PAYMENT_GATEWAY, targets) ===
        true;
    if (signed) {
      return true;
    }
    const origin = request.headers.origin;
    const fromAdmin =
      origin === this.allowedOrigin ||
      (origin !== undefined &&
        this.workspaceTemplate !== undefined &&
        slugOfOrigin(this.workspaceTemplate, origin) !== null);
    if (!fromAdmin) {
      throw new AppError(
        403,
        'origin_rejected',
        'Yêu cầu bị từ chối vì không đến từ trang quản trị',
      );
    }
    return true;
  }
}
