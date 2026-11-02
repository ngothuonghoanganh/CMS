import {
  isWorkspaceOriginTemplate,
  slugOfOrigin,
  WORKSPACE_SLUG_PLACEHOLDER,
} from '@plp/contracts';
import { z } from 'zod';

const secret = z.string().min(32, 'must be at least 32 characters');

const baseEnvSchema = z.object({
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
   * Keys the per-account attempt counters (HMAC of the email), so a copy of the database cannot
   * tell which emails tried to log in. Changing it resets every counter.
   */
  LOGIN_ATTEMPT_SECRET: secret,
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
  /**
   * The admin address of each workspace (ADR-025), e.g. "https://{slug}.app.example.vn"; unset,
   * every workspace opens at `ADMIN_ORIGIN`.
   */
  ADMIN_WORKSPACE_ORIGIN_TEMPLATE: z
    .string()
    .refine((value) => value.includes(WORKSPACE_SLUG_PLACEHOLDER), 'must contain {slug}')
    .refine(isWorkspaceOriginTemplate, 'must be an origin with {slug} in its host and no path')
    .optional(),
  /**
   * `Domain` of the session cookie: the parent of the common and the workspace addresses, so one
   * login serves them all (ADR-025). Required with `ADMIN_WORKSPACE_ORIGIN_TEMPLATE`.
   */
  SESSION_COOKIE_DOMAIN: z
    .string()
    .regex(
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/,
      'must be a lowercase host name, without a leading dot',
    )
    .optional(),

  /** Public origin of a site's default domain, e.g. "https://{subdomain}.payload.site". */
  PUBLIC_SITE_ORIGIN_TEMPLATE: z
    .string()
    .refine((value) => value.includes('{subdomain}'), 'must contain {subdomain}')
    .refine((value) => URL.canParse(value.replace('{subdomain}', 'example')), 'must be a URL'),

  /** Custom domains (ADR-022): where a name under a registrable domain points, as a CNAME. */
  CUSTOM_DOMAIN_CNAME_TARGET: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9.-]+$/, 'must be a hostname')
    .default('cname.payload.site'),
  /** Where a registrable domain points, as A records: the edge's static IPv4 addresses. */
  CUSTOM_DOMAIN_IPV4: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item !== ''),
    )
    .pipe(z.array(z.ipv4())),
  /** Public origin of a custom domain, e.g. "https://{host}". */
  CUSTOM_DOMAIN_ORIGIN_TEMPLATE: z
    .string()
    .refine((value) => value.includes('{host}'), 'must contain {host}')
    .refine((value) => URL.canParse(value.replace('{host}', 'example.vn')), 'must be a URL')
    .default('https://{host}'),
  /**
   * Answers DNS questions from a JSON file instead of the network, for development and E2E runs,
   * where test domains have no real records. Refused in production.
   */
  DOMAIN_DNS_ZONE_FILE: z.string().min(1).optional(),
  /** Whether a domain needs a valid HTTPS certificate to be active; on in production. */
  DOMAIN_TLS_CHECK: z.enum(['on', 'off']).optional(),
  /** How often each instance checks the domains due; 0 turns the checks off (tests). */
  DOMAIN_MONITOR_INTERVAL_MS: z.coerce.number().int().min(0).default(60_000),

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

  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(3),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  /** Public base URL of the bucket, e.g. "https://cdn.example.com/plp-assets". */
  S3_PUBLIC_BASE_URL: z.url(),

  /**
   * The AI that writes pages (ADR-031): `openai-compatible` calls `{AI_BASE_URL}/chat/completions`
   * (Ollama, LM Studio, vLLM, LiteLLM or a hosted service), `fake` writes fixed text for tests and
   * E2E and is refused in production, `none` turns AI off.
   */
  AI_PROVIDER: z.enum(['none', 'openai-compatible', 'fake']).default('none'),
  /** E.g. "http://localhost:11434/v1"; required by `openai-compatible`. */
  AI_BASE_URL: z.url({ protocol: /^https?$/ }).optional(),
  /** Sent as `Authorization: Bearer …`; never logged. Local servers accept any value. */
  AI_API_KEY: z.string().min(1).optional(),
  AI_MODEL: z.string().min(1).max(200).optional(),
  /** How long one AI request may take before it counts as failed. */
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600_000).default(60_000),
  /** AI uses per workspace per calendar month in Vietnam. */
  AI_MONTHLY_QUOTA: z.coerce.number().int().min(0).max(100_000).default(100),
});

/** Emails go to an SMTP server (ADR-018), the default. */
const smtpMailSchema = z.object({
  MAIL_TRANSPORT: z.literal('smtp').default('smtp'),
  /**
   * SMTP server for every email the API sends, e.g. "smtp://localhost:1125" (Mailpit) or
   * "smtps://user:pass@smtp.example.com:465".
   */
  SMTP_URL: z.url({ protocol: /^smtps?$/ }),
  /** Sender of those emails, e.g. "Payload Landing Page <no-reply@payload.site>". */
  LEAD_EMAIL_FROM: z.string().trim().min(3).max(200),
});

/** Emails go to the queue of plp-mailer, which renders and sends them with SES (ADR-029). */
const sqsMailSchema = z.object({
  MAIL_TRANSPORT: z.literal('sqs'),
  /** The `MailQueue` URL from the plp-mailer stack; http only for a local SQS-compatible queue. */
  MAIL_QUEUE_URL: z.url({ protocol: /^https?$/ }),
  /** The queue's AWS region, e.g. "ap-southeast-1". */
  MAIL_QUEUE_REGION: z.string().regex(/^[a-z]{2}(-[a-z]+)+-\d+$/, 'must be an AWS region'),
});

const envSchema = baseEnvSchema.and(
  z.discriminatedUnion('MAIL_TRANSPORT', [smtpMailSchema, sqsMailSchema]),
);

export type Env = z.infer<typeof envSchema>;
export type EnvInput = z.input<typeof envSchema>;
export type SqsMailEnv = z.infer<typeof sqsMailSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid API environment:\n${z.prettifyError(result.error)}`);
  }
  if (result.data.NODE_ENV === 'production' && result.data.DOMAIN_DNS_ZONE_FILE !== undefined) {
    throw new Error(
      'Invalid API environment:\nDOMAIN_DNS_ZONE_FILE answers DNS from a file; production asks real DNS',
    );
  }
  if (tlsCheckEnabled(result.data) && result.data.CUSTOM_DOMAIN_IPV4.length === 0) {
    throw new Error(
      'Invalid API environment:\nCUSTOM_DOMAIN_IPV4 is required while HTTPS is checked: the check connects to the edge',
    );
  }
  checkWorkspaceAddresses(result.data);
  checkAi(result.data);
  return result.data;
}

/** The AI service a provider needs, and no fixed text in production (ADR-031). */
function checkAi(env: Env): void {
  if (env.AI_PROVIDER === 'fake' && env.NODE_ENV === 'production') {
    throw new Error(
      'Invalid API environment:\nAI_PROVIDER=fake writes fixed text for tests; production needs a real AI service',
    );
  }
  if (env.AI_PROVIDER !== 'openai-compatible') {
    return;
  }
  const missing = (['AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL'] as const).filter(
    (name) => env[name] === undefined,
  );
  if (missing.length > 0) {
    throw new Error(
      `Invalid API environment:\nAI_PROVIDER=openai-compatible needs ${missing.join(', ')}`,
    );
  }
}

/**
 * Workspace addresses need the session cookie on a domain that holds the common address and
 * every workspace address; otherwise one of them would sign in alone (ADR-025).
 */
function checkWorkspaceAddresses(env: Env): void {
  const template = env.ADMIN_WORKSPACE_ORIGIN_TEMPLATE;
  if (template === undefined) {
    // One address keeps the host-only cookie it always had.
    if (env.SESSION_COOKIE_DOMAIN !== undefined) {
      throw new Error(
        'Invalid API environment:\nSESSION_COOKIE_DOMAIN applies only with ADMIN_WORKSPACE_ORIGIN_TEMPLATE',
      );
    }
    return;
  }
  if (slugOfOrigin(template, new URL(env.ADMIN_ORIGIN).origin) !== null) {
    throw new Error(
      'Invalid API environment:\nADMIN_ORIGIN would be read as a workspace address; give it a reserved name such as app',
    );
  }
  const domain = env.SESSION_COOKIE_DOMAIN;
  if (domain === undefined) {
    throw new Error(
      'Invalid API environment:\nSESSION_COOKIE_DOMAIN is required with ADMIN_WORKSPACE_ORIGIN_TEMPLATE',
    );
  }
  const within = (host: string) => host === domain || host.endsWith(`.${domain}`);
  const workspaceHost = new URL(template.replace(WORKSPACE_SLUG_PLACEHOLDER, 'example')).hostname;
  if (!within(new URL(env.ADMIN_ORIGIN).hostname) || !within(workspaceHost)) {
    throw new Error(
      `Invalid API environment:\nADMIN_ORIGIN and ADMIN_WORKSPACE_ORIGIN_TEMPLATE must be under SESSION_COOKIE_DOMAIN (${domain})`,
    );
  }
  // The session must never reach a public site: their domain and the admin's stay apart (§6).
  const sites = baseDomainOf(env);
  if (sites === domain || sites.endsWith(`.${domain}`) || domain.endsWith(`.${sites}`)) {
    throw new Error(
      `Invalid API environment:\nSESSION_COOKIE_DOMAIN (${domain}) and the public sites' domain (${sites}) must not contain one another`,
    );
  }
}

/** HTTPS is checked unless turned off; it is on by default only in production (ADR-022). */
export function tlsCheckEnabled(env: Pick<Env, 'DOMAIN_TLS_CHECK' | 'NODE_ENV'>): boolean {
  return env.DOMAIN_TLS_CHECK === undefined
    ? env.NODE_ENV === 'production'
    : env.DOMAIN_TLS_CHECK === 'on';
}

/** The system's own domain, from the default origin template: "payload.site". */
export function baseDomainOf(env: Pick<Env, 'PUBLIC_SITE_ORIGIN_TEMPLATE'>): string {
  const host = new URL(env.PUBLIC_SITE_ORIGIN_TEMPLATE.replace('{subdomain}', 'x')).hostname;
  return host.slice(host.indexOf('.') + 1);
}

/** Public origin of a custom domain. */
export function customDomainOrigin(
  env: Pick<Env, 'CUSTOM_DOMAIN_ORIGIN_TEMPLATE'>,
  hostname: string,
): string {
  return env.CUSTOM_DOMAIN_ORIGIN_TEMPLATE.replace('{host}', hostname);
}

export function siteOrigin(
  env: Pick<Env, 'PUBLIC_SITE_ORIGIN_TEMPLATE'>,
  subdomain: string,
): string {
  return env.PUBLIC_SITE_ORIGIN_TEMPLATE.replace('{subdomain}', subdomain);
}
