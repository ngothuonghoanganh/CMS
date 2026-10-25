'use client';

import {
  type Asset,
  assetSchema,
  type EndpointDefinition,
  endpoints,
  problemSchema,
} from '@plp/contracts';
import type { z } from 'zod';
import {
  ApiError,
  type CallOptions,
  callEndpoint,
  type PathArgs,
  type ResponseOf,
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
