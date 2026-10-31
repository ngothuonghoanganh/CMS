import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import type { Env } from './config/env.js';

/**
 * Options for creating the Nest application, shared by the server and integration tests.
 * `rawBody` keeps the exact JSON bytes the renderer signed (ADR-016) as `req.rawBody`.
 */
export const NEST_APP_OPTIONS = { rawBody: true } as const;

/** HTTP settings shared by the server and integration tests. */
export function configureApp(
  app: NestExpressApplication,
  env: Pick<Env, 'TRUST_PROXY_HOPS'>,
): void {
  // Behind a trusted edge, `req.ip` is the client rather than the admin proxy (auth rate limit).
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.disable('x-powered-by');
  // The admin's headers do not reach responses of its /api rewrite, so the API marks its own
  // (CSV exports among them) as not to be sniffed (ADR-013). It comes first, so that responses of
  // the middleware below (a body over the limit, malformed JSON) carry it too.
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '1mb' });
}
