import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
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
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '1mb' });
  app.disable('x-powered-by');
}
