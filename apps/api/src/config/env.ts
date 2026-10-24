import { z } from 'zod';

const secret = z.string().min(32, 'must be at least 32 characters');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4100),
  MONGODB_URI: z
    .string()
    .regex(/^mongodb(\+srv)?:\/\//, 'must be a mongodb:// or mongodb+srv:// URI'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  /** Origin of the admin app; state-changing requests from any other origin are rejected. */
  ADMIN_ORIGIN: z.url(),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  /** Sign-up and login attempts allowed per client per minute. */
  AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(10),
  /** Secure cookies need HTTPS; only local development may turn this off. */
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),

  /** Public origin of a site's default domain, e.g. "https://{subdomain}.payload.site". */
  PUBLIC_SITE_ORIGIN_TEMPLATE: z
    .string()
    .refine((value) => value.includes('{subdomain}'), 'must contain {subdomain}')
    .refine((value) => URL.canParse(value.replace('{subdomain}', 'example')), 'must be a URL'),

  RENDERER_INTERNAL_URL: z.url(),
  REVALIDATE_SECRET: secret,
  PREVIEW_SECRET: secret,

  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(3),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  /** Public base URL of the bucket, e.g. "https://cdn.example.com/plp-assets". */
  S3_PUBLIC_BASE_URL: z.url(),
});

export type Env = z.infer<typeof envSchema>;
export type EnvInput = z.input<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid API environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export function siteOrigin(
  env: Pick<Env, 'PUBLIC_SITE_ORIGIN_TEMPLATE'>,
  subdomain: string,
): string {
  return env.PUBLIC_SITE_ORIGIN_TEMPLATE.replace('{subdomain}', subdomain);
}
