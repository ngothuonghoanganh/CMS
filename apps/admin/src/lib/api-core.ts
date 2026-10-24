import { type EndpointDefinition, type Problem, problemSchema } from '@plp/contracts';
import type { z } from 'zod';

/** A failed API call with the server's problem details (RFC 9457). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: Problem,
  ) {
    super(problem.title);
    this.name = 'ApiError';
  }

  get code(): Problem['code'] {
    return this.problem.code;
  }

  /** Field messages keyed by issue path ("email", "items.0.title"), first message wins. */
  fieldErrors(): Record<string, string> {
    const errors: Record<string, string> = {};
    for (const issue of this.problem.issues ?? []) {
      const key = issue.path.join('.');
      errors[key] ??= issue.message;
    }
    return errors;
  }
}

export type RequestBody<E> =
  E extends EndpointDefinition<readonly string[], infer Req, z.ZodType | null, z.ZodType | null>
    ? Req extends z.ZodType
      ? z.input<Req>
      : undefined
    : never;

export type RequestQuery<E> =
  E extends EndpointDefinition<readonly string[], z.ZodType | null, infer Query, z.ZodType | null>
    ? Query extends z.ZodType
      ? z.input<Query>
      : undefined
    : never;

export type ResponseOf<E> =
  E extends EndpointDefinition<readonly string[], z.ZodType | null, z.ZodType | null, infer Res>
    ? Res extends z.ZodType
      ? z.infer<Res>
      : undefined
    : never;

export type PathArgs<E> =
  E extends EndpointDefinition<infer Args, z.ZodType | null, z.ZodType | null, z.ZodType | null>
    ? Args
    : never;

export interface CallOptions<E> {
  body?: RequestBody<E>;
  query?: RequestQuery<E>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

function toQueryString(query: unknown): string {
  if (query === undefined || query === null || typeof query !== 'object') {
    return '';
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }
  const text = params.toString();
  return text === '' ? '' : `?${text}`;
}

async function toApiError(response: Response): Promise<ApiError> {
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  const problem = problemSchema.safeParse(parsed);
  if (problem.success) {
    return new ApiError(response.status, problem.data);
  }
  return new ApiError(response.status, {
    type: 'about:blank',
    title:
      response.status >= 500
        ? 'Máy chủ đang gặp sự cố, hãy thử lại sau'
        : 'Yêu cầu không thành công',
    status: response.status,
    code: response.status >= 500 ? 'internal' : 'validation_failed',
  });
}

/**
 * Calls one endpoint of the catalog: builds the URL, sends JSON, validates the response with the
 * endpoint's schema and throws ApiError for problem responses.
 */
export async function callEndpoint<
  E extends EndpointDefinition<
    readonly string[],
    z.ZodType | null,
    z.ZodType | null,
    z.ZodType | null
  >,
>(
  baseUrl: string,
  endpoint: E,
  args: PathArgs<E>,
  options: CallOptions<E>,
  init: RequestInit = {},
): Promise<ResponseOf<E>> {
  const path = endpoint.path(...args);
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    headers.set(name, value);
  }
  const hasBody = options.body !== undefined;
  if (hasBody) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${baseUrl}${path}${toQueryString(options.query)}`, {
    ...init,
    method: endpoint.method,
    headers,
    ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!response.ok) {
    throw await toApiError(response);
  }
  if (endpoint.response === null) {
    return undefined as ResponseOf<E>;
  }
  const json: unknown = await response.json();
  const parsed = endpoint.response.safeParse(json);
  if (!parsed.success) {
    throw new Error(`API response for ${endpoint.method} ${path} does not match the contract`, {
      cause: parsed.error,
    });
  }
  return parsed.data as ResponseOf<E>;
}
