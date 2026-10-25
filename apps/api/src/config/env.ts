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
  /**
   * Failed logins allowed per account (email) in one window; further attempts, even with the
   * right password, are refused until the window ends. Holds whatever proxy setup is deployed.
   */
  LOGIN_FAILURE_LIMIT: z.coerce.number().int().min(1).default(5),
  LOGIN_FAILURE_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  /**
   * Proxies between the browser and the API whose `X-Forwarded-For` entry is trusted. The client
   * address, which keys the auth rate limit, is read through them. Default 0: the admin's `/api`
   * rewrite passes on whatever the browser sent, so trusting it without an edge proxy that
   * appends the socket address would let a client pick a fresh bucket per request (ADR-004).
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
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
  /**
   * Shared with the renderer, which signs the visitor requests it relays (lead form, ADR-016):
   * only signed requests may carry the visitor's address and user agent.
   */
  RENDERER_API_SECRET: secret,
  /** Leads one visitor address may send to one site per window (ADR-016). */
  LEAD_LIMIT_PER_CLIENT: z.coerce.number().int().min(1).default(5),
  LEAD_LIMIT_PER_CLIENT_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(10),
  /** Leads one site accepts per hour, whoever sends them; protects storage from a flood. */
  LEAD_LIMIT_PER_SITE_PER_HOUR: z.coerce.number().int().min(1).default(300),
  /**
   * Page views one visitor address counts on one site per window (ADR-019). Views over a limit
   * are not counted; the visitor never notices.
   */
  PAGE_VIEW_LIMIT_PER_CLIENT: z.coerce.number().int().min(1).default(60),
  PAGE_VIEW_LIMIT_PER_CLIENT_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(10),
  /** Page views one site counts per hour, whoever sends them. */
  PAGE_VIEW_LIMIT_PER_SITE_PER_HOUR: z.coerce.number().int().min(1).default(20_000),

  /**
   * SMTP server for lead notifications and recipient confirmations (ADR-018), e.g.
   * "smtp://localhost:1125" (Mailpit) or "smtps://user:pass@smtp.example.com:465".
   */
  SMTP_URL: z.url({ protocol: /^smtps?$/ }),
  /** Sender of those emails, e.g. "Payload Landing Page <no-reply@payload.site>". */
  LEAD_EMAIL_FROM: z.string().trim().min(3).max(200),

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
