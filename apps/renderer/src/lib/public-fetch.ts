import type { z } from 'zod';

/** A public API call should answer well within this; a hung API must not hang page requests. */
const REQUEST_TIMEOUT_MS = 10_000;

export interface PublicRequest<S extends z.ZodType> {
  baseUrl: string;
  /** Path from the endpoint catalog, e.g. `endpoints.publicResolve.path(subdomain)`. */
  path: string;
  query?: Record<string, string>;
  schema: S;
  /** Endpoint name for error messages. The URL is left out on purpose: it may carry a token. */
  label: string;
  cache?: RequestCache;
}

/**
 * GETs a public API endpoint and validates the body against its contract. A 404 is an answer
 * (null), so callers can cache "nothing here"; every other failure throws with its cause.
 */
export async function fetchPublicJson<S extends z.ZodType>(
  request: PublicRequest<S>,
): Promise<z.output<S> | null> {
  const query = new URLSearchParams(request.query).toString();
  const url = `${request.baseUrl}${request.path}${query === '' ? '' : `?${query}`}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ...(request.cache === undefined ? {} : { cache: request.cache }),
    });
  } catch (error) {
    throw new Error(`Public API request ${request.label} failed`, { cause: error });
  }
  if (response.status === 404) {
    await response.body?.cancel();
    return null;
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Public API request ${request.label} answered HTTP ${response.status}`);
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch (error) {
    throw new Error(`Public API request ${request.label} returned invalid JSON`, { cause: error });
  }
  const parsed = request.schema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Public API response of ${request.label} does not match the contract`, {
      cause: parsed.error,
    });
  }
  return parsed.data;
}
