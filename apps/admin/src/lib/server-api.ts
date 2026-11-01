import { type EndpointDefinition, endpoints, type MeResponse } from '@plp/contracts';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { z } from 'zod';
import { parseAdminEnv } from '../env';
import {
  ApiError,
  type CallOptions,
  callEndpoint,
  type PathArgs,
  type ResponseOf,
} from './api-core';

/**
 * Server Components call the API directly, forwarding the visitor's cookies as the browser sent
 * them: a parsed cookie map keeps one of two session cookies of the same name, and the API picks
 * the one valid in its mode (ADR-025).
 */
export async function serverApi<
  E extends EndpointDefinition<
    readonly string[],
    z.ZodType | null,
    z.ZodType | null,
    z.ZodType | null
  >,
>(endpoint: E, args: PathArgs<E>, options: CallOptions<E> = {}): Promise<ResponseOf<E>> {
  const env = parseAdminEnv(process.env);
  const cookieHeader = (await headers()).get('cookie') ?? '';
  return callEndpoint(env.API_INTERNAL_URL, endpoint, args, options, {
    headers: cookieHeader === '' ? {} : { cookie: cookieHeader },
    cache: 'no-store',
  });
}

/** The signed-in user; redirects to the login page when the session is missing or expired. */
export async function requireMe(nextPath?: string): Promise<MeResponse> {
  try {
    return await serverApi(endpoints.me, []);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : '/login');
    }
    throw error;
  }
}
