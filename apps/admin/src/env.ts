import { z } from 'zod';

const adminEnvSchema = z.object({
  API_INTERNAL_URL: z.url({ protocol: /^https?$/ }),
  /** Public origin of a site's default domain, e.g. "https://{subdomain}.payload.site". */
  PUBLIC_SITE_ORIGIN_TEMPLATE: z
    .string()
    .refine((value) => value.includes('{subdomain}'), 'must contain {subdomain}'),
});

export type AdminEnv = z.infer<typeof adminEnvSchema>;

export function parseAdminEnv(source: Record<string, string | undefined>): AdminEnv {
  const result = adminEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid admin environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
