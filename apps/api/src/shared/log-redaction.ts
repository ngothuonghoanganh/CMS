/** Placeholder written to logs instead of a secret. */
export const REDACTED = '[redacted]';

/**
 * Request and response fields pino replaces with "[Redacted]": session secrets, and a visitor's
 * address and user agent relayed by the renderer for the lead form (ADR-016, rule 10). Bodies are
 * never logged.
 */
export const LOG_REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  'req.headers["x-plp-client-ip"]',
  'req.headers["x-plp-client-ua"]',
  'req.headers["x-plp-renderer-signature"]',
] as const;

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

/** `q=` of a query string: a search, which in the lead inbox is a phone number, email or name. */
const SEARCH_PARAM = /([?&]q=)[^&#]*/g;

/** The URL with the value of any `q` search parameter replaced (rule 10). */
export function redactSearch(url: string): string {
  return url.replace(SEARCH_PARAM, `$1${REDACTED}`);
}

function redactSearchInQuery(query: unknown): unknown {
  return typeof query === 'object' && query !== null && 'q' in query
    ? { ...query, q: REDACTED }
    : query;
}

/**
 * The headers with a search in `Referer` replaced: an admin page's own URL comes along with every
 * request it makes. A copy, since pino hands over the live request's headers.
 */
function redactSearchInReferer(headers: unknown): unknown {
  if (typeof headers !== 'object' || headers === null || !('referer' in headers)) {
    return headers;
  }
  const { referer } = headers;
  if (typeof referer !== 'string') {
    return headers;
  }
  const redacted = redactSearch(referer);
  return redacted === referer ? headers : { ...headers, referer: redacted };
}

/** The parts of pino's serialized request that can carry a token or a search. */
export interface LoggableRequest {
  url: string;
  query?: unknown;
  params?: unknown;
  headers?: unknown;
}

/**
 * pino-http request serializer (wrapped around the standard one). Redacts a search (`q`) in `url`,
 * `query` and the `Referer` header, and the preview token in `url` and wherever the router put it
 * in `params`
 * (`{ token }`, or Express 5's `{ splat: [...] }` when middleware matched the path). It assigns
 * redacted copies to the serialized request and never touches the live Express request.
 */
export function serializeRequest<R extends LoggableRequest>(req: R): R {
  req.url = redactSearch(req.url);
  if (req.query !== undefined) {
    req.query = redactSearchInQuery(req.query);
  }
  if (req.headers !== undefined) {
    req.headers = redactSearchInReferer(req.headers);
  }
  const token = previewToken(req.url);
  if (token === null) {
    return req;
  }
  req.url = redactPreviewToken(req.url);
  req.params = redactSecret(req.params, token);
  return req;
}

/** What a logged error shows in place of a sha256 (or any longer run of hex digits). */
export const HASH_PLACEHOLDER = '[hash]';

/**
 * 64 hex digits or more. Some keys hold an unsalted sha256 of an email address (the confirmation
 * email limits, ADR-018), a pseudonym of personal data; no log needs a sha256 value. Ids (24 hex
 * digits) and request ids (UUIDs) are shorter and stay readable.
 */
const HEX_RUN = /[0-9a-f]{64,}/gi;

/** Fields of an error that are not enumerable but say what went wrong. */
const ERROR_FIELDS = ['name', 'message', 'stack', 'errmsg', 'cause', 'errors'] as const;

function hasToJson(value: object): value is { toJSON: () => unknown } {
  return 'toJSON' in value && typeof value.toJSON === 'function';
}

/** A copy of `value` with every run of 64 hex digits in its strings replaced, cycles kept. */
function redactHashesIn(value: unknown, copies: WeakMap<object, unknown>): unknown {
  if (typeof value === 'string') {
    return value.replace(HEX_RUN, HASH_PLACEHOLDER);
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  const known = copies.get(value);
  if (known !== undefined) {
    return known;
  }
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    copies.set(value, copy);
    for (const item of value) {
      copy.push(redactHashesIn(item, copies));
    }
    return copy;
  }
  // What the log would write for it: an ObjectId's hex string, a Date's ISO string.
  if (!(value instanceof Error) && hasToJson(value)) {
    const json = value.toJSON();
    if (json !== value) {
      return redactHashesIn(json, copies);
    }
  }
  const copy: Record<string, unknown> = {};
  copies.set(value, copy);
  if (value instanceof Error) {
    for (const field of ERROR_FIELDS) {
      if (field in value) {
        copy[field] = redactHashesIn(Reflect.get(value, field), copies);
      }
    }
  }
  for (const [key, item] of Object.entries(value)) {
    copy[key] = redactHashesIn(item, copies);
  }
  return copy;
}

/**
 * pino's error serializer (`err`, after the standard one, which folds the causes' messages and
 * stacks into the error's own): every run of 64 hex digits in the logged error becomes `[hash]`,
 * in its message and stack, the driver's `errmsg` and `keyValue`, and its nested `cause` and
 * `errors` (AggregateError), at any depth. A net under logs that pass an error on whole, e.g. a
 * duplicate key error on a limit key that holds the hash of an address, rethrown as the cause of
 * a 500 (`ProblemFilter`). Returns a copy; the error itself is not changed.
 */
export function serializeError(error: unknown): unknown {
  return redactHashesIn(error, new WeakMap());
}
