/** Placeholder written to logs instead of a secret. */
export const REDACTED = '[redacted]';

/** `/public/preview/{token}`: the path segment is a signed preview token (ADR-010). */
const PREVIEW_TOKEN_IN_PATH = /(\/public\/preview\/)([^/?#]+)/;

/** The preview token in a URL, if it is a preview URL. */
function previewToken(url: string): string | null {
  return PREVIEW_TOKEN_IN_PATH.exec(url)?.[2] ?? null;
}

/** The URL with any preview token replaced, so a log line never grants access to a draft. */
export function redactPreviewToken(url: string): string {
  return url.replace(PREVIEW_TOKEN_IN_PATH, `$1${REDACTED}`);
}

/** A copy of `value` with every occurrence of `secret` in its strings replaced. */
function redactSecret(value: unknown, secret: string): unknown {
  if (typeof value === 'string') {
    return value.split(secret).join(REDACTED);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSecret(item, secret));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactSecret(item, secret)]),
    );
  }
  return value;
}

/** The parts of pino's serialized request that can carry the token. */
export interface LoggableRequest {
  url: string;
  params?: unknown;
}

/**
 * pino-http request serializer (wrapped around the standard one): redacts the preview token in
 * `url` and wherever the router put it in `params` (`{ token }`, or Express 5's `{ splat: [...] }`
 * when middleware matched the path). It assigns redacted copies to the serialized request and
 * never touches the live Express request.
 */
export function serializeRequest<R extends LoggableRequest>(req: R): R {
  const token = previewToken(req.url);
  if (token === null) {
    return req;
  }
  req.url = redactPreviewToken(req.url);
  req.params = redactSecret(req.params, token);
  return req;
}
