import { isIP } from 'node:net';
import {
  applyDecorators,
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import {
  CLIENT_IP_HEADER,
  CLIENT_UA_HEADER,
  CLIENT_UA_MAX,
  RENDERER_SIGNATURE_HEADER,
  RENDERER_TIMESTAMP_HEADER,
} from '@plp/contracts';
import type { Request } from 'express';
import type { Env } from '../../config/env.js';
import { Public } from '../../modules/auth/public.decorator.js';
import { InjectEnv } from '../env.js';
import { AppError } from '../errors.js';
import { verifyRendererSignature } from './renderer-signature.js';

/** Metadata of routes only the renderer calls; `OriginGuard` leaves their check to the signature. */
export const SIGNED_BY_RENDERER = 'plp:signedByRenderer';

/** The visitor behind a relayed request, as the renderer reported it. */
export interface RendererClient {
  /** Null when the renderer could not trust any address (no proxy in front of it). */
  ip: string | null;
  userAgent: string;
}

interface RendererRequest extends RawBodyRequest<Request> {
  rendererClient?: RendererClient;
}

function header(request: Request, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Accepts only requests the renderer signed with `RENDERER_API_SECRET` (ADR-016): the signature
 * covers the method, path, visitor address, user agent and the exact body bytes.
 */
@Injectable()
export class RendererSignatureGuard implements CanActivate {
  private readonly secret: string;

  constructor(@InjectEnv() env: Env) {
    this.secret = env.RENDERER_API_SECRET;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RendererRequest>();
    const clientIp = header(request, CLIENT_IP_HEADER) ?? '';
    const userAgent = header(request, CLIENT_UA_HEADER) ?? '';
    const check = verifyRendererSignature(
      this.secret,
      {
        timestamp: header(request, RENDERER_TIMESTAMP_HEADER),
        signature: header(request, RENDERER_SIGNATURE_HEADER),
        method: request.method,
        path: request.originalUrl.split('?')[0] ?? '',
        clientIp,
        userAgent,
        body: request.rawBody?.toString('utf8') ?? '',
      },
      Math.floor(Date.now() / 1000),
    );
    if (!check.ok) {
      throw new AppError(401, 'unauthenticated', 'Yêu cầu không đến từ trang public', {
        detail: `Renderer signature rejected: ${check.reason}`,
      });
    }
    if (clientIp !== '' && isIP(clientIp) === 0) {
      throw new AppError(401, 'unauthenticated', 'Yêu cầu không đến từ trang public', {
        detail: 'Renderer sent an invalid client address',
      });
    }
    request.rendererClient = {
      ip: clientIp === '' ? null : clientIp,
      userAgent: userAgent.slice(0, CLIENT_UA_MAX),
    };
    return true;
  }
}

/** A public route the renderer calls for a visitor: no session, no Origin check, a signature. */
export function RendererRequest(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    Public(),
    SetMetadata(SIGNED_BY_RENDERER, true),
    UseGuards(RendererSignatureGuard),
  );
}

/** The visitor behind a signed request; only valid on `@RendererRequest()` routes. */
export const VisitorClient = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RendererClient => {
    const client = context.switchToHttp().getRequest<RendererRequest>().rendererClient;
    if (!client) {
      throw new Error('VisitorClient used on a route without @RendererRequest()');
    }
    return client;
  },
);
