import { z } from 'zod';

/**
 * `WORKSPACE_SLUG_PLACEHOLDER` of `@plp/contracts`, spelled out: `next.config.ts` loads this file
 * as CommonJS, and the contracts package is ESM only. `env.spec.ts` keeps the two the same.
 */
export const SLUG_PLACEHOLDER = '{slug}';

/** Whether a template puts the slug in its host, with nothing after the origin. */
function isOriginTemplate(template: string): boolean {
  try {
    const url = new URL(template.replace(SLUG_PLACEHOLDER, 'slug-probe'));
    return (
      url.host.includes('slug-probe') &&
      url.pathname === '/' &&
      url.search === '' &&
      url.hash === ''
    );
  } catch {
    return false;
  }
}

const adminEnvSchema = z
  .object({
    API_INTERNAL_URL: z.url({ protocol: /^https?$/ }),
    /** Public origin of a site's default domain, e.g. "https://{subdomain}.payload.site". */
    PUBLIC_SITE_ORIGIN_TEMPLATE: z
      .string()
      .refine((value) => value.includes('{subdomain}'), 'must contain {subdomain}'),
    /**
     * The API's setting, read here too: secure cookies mean the admin is served over HTTPS, so its
     * responses ask browsers to keep using HTTPS (HSTS). Read at build time, like the rewrites.
     */
    COOKIE_SECURE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    /** The common address of the admin, where a user picks a workspace (ADR-025). */
    ADMIN_ORIGIN: z.url({ protocol: /^https?$/ }).optional(),
    /**
     * The admin address of each workspace, e.g. "https://{slug}.app.example.vn" (ADR-025), as the API
     * has it. Unset, every workspace opens at one address and the user picks it in the sidebar.
     */
    ADMIN_WORKSPACE_ORIGIN_TEMPLATE: z
      .string()
      .refine((value) => value.includes(SLUG_PLACEHOLDER), 'must contain {slug}')
      .refine(isOriginTemplate, 'must be an origin with {slug} in its host and no path')
      .optional(),
  })
  .refine(
    (env) => env.ADMIN_WORKSPACE_ORIGIN_TEMPLATE === undefined || env.ADMIN_ORIGIN !== undefined,
    {
      message: 'ADMIN_ORIGIN is required with ADMIN_WORKSPACE_ORIGIN_TEMPLATE',
      path: ['ADMIN_ORIGIN'],
    },
  );

export type AdminEnv = z.infer<typeof adminEnvSchema>;

export function parseAdminEnv(source: Record<string, string | undefined>): AdminEnv {
  const result = adminEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid admin environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
