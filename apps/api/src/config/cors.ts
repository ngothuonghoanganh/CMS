import type { Environment } from './env';

export type CorsPolicy = {
  credentials: boolean;
  origin: boolean | string[];
};

/**
 * Keep credentialed CORS explicit in production. A wildcard is useful for the
 * local fixture and is intentionally reflected only outside production.
 */
export function resolveCorsPolicy(
  config: Pick<Environment, 'CORS_ORIGIN' | 'NODE_ENV'>,
): CorsPolicy {
  const origins = config.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const hasWildcard = origins.includes('*');

  if (config.NODE_ENV === 'production' && hasWildcard) {
    throw new Error('Wildcard CORS origins are not allowed in production');
  }

  return {
    credentials: origins.length > 0,
    origin: origins.length === 0 ? false : hasWildcard ? true : origins,
  };
}
