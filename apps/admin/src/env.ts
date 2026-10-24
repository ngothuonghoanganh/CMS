import { z } from 'zod';

const adminEnvSchema = z.object({
  API_INTERNAL_URL: z.url({ protocol: /^https?$/ }),
});

export type AdminEnv = z.infer<typeof adminEnvSchema>;

export function parseAdminEnv(source: Record<string, string | undefined>): AdminEnv {
  const result = adminEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid admin environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
