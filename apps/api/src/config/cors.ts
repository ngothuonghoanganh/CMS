import type { Environment } from './env';

export type CorsPolicy = {
  credentials: boolean;
  origin: boolean | string[];
};

function normalizeOrigin(origin: string): string {
  if (origin === '*') return origin;

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error(`Invalid CORS origin: ${origin}`);
  }

  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`Invalid CORS origin: ${origin}`);
  }

  return parsed.origin;
}

/**
 * Keep credentialed CORS explicit in production. A wildcard is useful for the
 * local fixture and is intentionally reflected only outside production.
 */
export function resolveCorsPolicy(
  config: Pick<Environment, 'CORS_ORIGIN' | 'NODE_ENV'>,
): CorsPolicy {
  const origins = [
    ...new Set(
      config.CORS_ORIGIN.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
        .map(normalizeOrigin),
    ),
  ];
  const hasWildcard = origins.includes('*');

  if (config.NODE_ENV === 'production' && hasWildcard) {
    throw new Error('Wildcard CORS origins are not allowed in production');
  }

  return {
    credentials: origins.length > 0,
    origin: origins.length === 0 ? false : hasWildcard ? true : origins,
  };
}
