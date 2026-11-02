'use client';

import {
  AI_JOB_STREAM_TYPE,
  type Asset,
  assetSchema,
  type EndpointDefinition,
  endpoints,
  EXPORT_TRUNCATED_HEADER,
  problemSchema,
} from '@plp/contracts';
import type { z } from 'zod';
import {
  ApiError,
  type CallOptions,
  callEndpoint,
  type PathArgs,
  type ResponseOf,
  toApiError,
  toQueryString,
} from './api-core';

export { ApiError };

/** Browser calls go through the admin's /api proxy so the session cookie stays first-party. */
export function api<
  E extends EndpointDefinition<
    readonly string[],
    z.ZodType | null,
    z.ZodType | null,
    z.ZodType | null
  >,
>(endpoint: E, args: PathArgs<E>, options: CallOptions<E> = {}): Promise<ResponseOf<E>> {
  return callEndpoint('/api', endpoint, args, options, { credentials: 'same-origin' });
}

/** Multipart upload of one image with its description (or the decorative flag). */
export async function uploadAsset(
  siteId: string,
  file: File,
  fields: { alt: string; decorative: boolean },
  signal?: AbortSignal,
): Promise<Asset> {
  const form = new FormData();
  form.set('file', file);
  form.set('alt', fields.alt);
  form.set('decorative', String(fields.decorative));
  const response = await fetch(`/api${endpoints.uploadAsset.path(siteId)}`, {
    method: 'POST',
    body: form,
    credentials: 'same-origin',
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch((error: unknown) => {
      console.error('Upload error response was not JSON', error);
      return undefined;
    });
    const problem = problemSchema.safeParse(body);
    throw new ApiError(
      response.status,
      problem.success
        ? problem.data
        : {
            type: 'about:blank',
            title: 'Tải ảnh lên không thành công',
            status: response.status,
            code: 'internal',
          },
    );
  }
  return assetSchema.parse(await response.json());
}

/**
 * Splits what arrived of an NDJSON stream into its complete lines, keeping the unfinished last
 * one for the next chunk. Blank lines are skipped.
 */
export function splitLines(pending: string): { lines: string[]; rest: string } {
  const parts = pending.split('\n');
  const rest = parts.pop() ?? '';
  return { lines: parts.filter((line) => line.trim() !== ''), rest };
}

/**
 * Calls an endpoint that answers with an NDJSON stream (an AI job, ADR-031) through the `/api`
 * proxy, and hands each line to `onEvent`, parsed by `schema`, as it arrives. A refused request
 * throws its ApiError before any line. Resolves when the server ends the stream; aborting
 * `options.signal` only stops reading, the server's work goes on.
 */
export async function streamEndpoint<
  E extends EndpointDefinition<
    readonly string[],
    z.ZodType | null,
    z.ZodType | null,
    z.ZodType | null
  >,
  T,
>(
  endpoint: E,
  args: PathArgs<E>,
  options: CallOptions<E>,
  schema: z.ZodType<T>,
  onEvent: (event: T) => void,
): Promise<void> {
  const hasBody = options.body !== undefined;
  const response = await fetch(`/api${endpoint.path(...args)}${toQueryString(options.query)}`, {
    method: endpoint.method,
    credentials: 'same-origin',
    headers: {
      Accept: AI_JOB_STREAM_TYPE,
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!response.ok) {
    throw await toApiError(response);
  }
  if (response.body === null) {
    throw new Error(`${endpoint.method} ${endpoint.path(...args)} answered without a stream`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  const emit = (line: string) => {
    onEvent(schema.parse(JSON.parse(line)));
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    const split = splitLines(pending + decoder.decode(value, { stream: true }));
    pending = split.rest;
    split.lines.forEach(emit);
  }
  const last = pending + decoder.decode();
  if (last.trim() !== '') {
    emit(last);
  }
}

/** What the server said about a downloaded export. */
export interface DownloadedFile {
  /** More leads matched than the file holds (`EXPORT_TRUNCATED_HEADER`). */
  truncated: boolean;
}

/** The file name of a `Content-Disposition: attachment; filename="…"` header. */
export function attachmentFilename(disposition: string | null): string | null {
  return disposition === null ? null : (/filename="([^"]+)"/.exec(disposition)?.[1] ?? null);
}

/**
 * Calls an endpoint that answers with a file (a CSV or JSON export) and saves it under the name
 * the server gave. The request goes through the `/api` proxy like `api()`, so state-changing
 * exports keep the session cookie and the Origin check.
 */
export async function downloadFile<
  E extends EndpointDefinition<
    readonly string[],
    z.ZodType | null,
    z.ZodType | null,
    z.ZodType | null
  >,
>(endpoint: E, args: PathArgs<E>, options: CallOptions<E> = {}): Promise<DownloadedFile> {
  const hasBody = options.body !== undefined;
  const response = await fetch(`/api${endpoint.path(...args)}${toQueryString(options.query)}`, {
    method: endpoint.method,
    credentials: 'same-origin',
    ...(hasBody
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options.body) }
      : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!response.ok) {
    throw await toApiError(response);
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = attachmentFilename(response.headers.get('Content-Disposition')) ?? 'du-lieu';
  document.body.append(link);
  link.click();
  link.remove();
  // After the click has handed the file to the browser's download.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
  return { truncated: response.headers.get(EXPORT_TRUNCATED_HEADER) === 'true' };
}
