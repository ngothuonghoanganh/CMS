import { z } from 'zod';

/** A host name with an optional port: "payload.site", "localhost:3101". */
const HOST_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*(?::\d{1,5})?$/;

const rendererEnvSchema = z.object({
  /** Base URL of the API for server-side calls, without a trailing slash. */
  API_PUBLIC_URL: z.url({ protocol: /^https?$/ }).transform((value) => value.replace(/\/+$/, '')),
  /** Sites live at `{subdomain}.{BASE_DOMAIN}`. */
  BASE_DOMAIN: z
    .string()
    .trim()
    .toLowerCase()
    .regex(HOST_PATTERN, 'must be a host name such as "payload.site" or "localhost:3101"'),
  PUBLIC_SITE_PROTOCOL: z.enum(['http', 'https']),
  /** Shared with the API to sign revalidation webhooks. */
  REVALIDATE_SECRET: z.string().min(32),
  /** Trust `x-forwarded-host` only behind a proxy that sets it. */
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export type RendererEnv = z.infer<typeof rendererEnvSchema>;

export function parseRendererEnv(source: Record<string, string | undefined>): RendererEnv {
  const result = rendererEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid renderer environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/** The validated environment of the running process; next.config.ts parses it once at boot. */
export function rendererEnv(): RendererEnv {
  return parseRendererEnv(process.env);
}
