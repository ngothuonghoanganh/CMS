import { resolve } from 'node:path';

import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: resolve(__dirname, '../../../.env') });
dotenv.config();

const environmentSchema = z
  .object({
    AUTH_ACCESS_TOKEN_COOKIE_NAME: z
      .string()
      .trim()
      .min(1)
      .default('payload_access_token'),
    AUTH_ACCESS_TOKEN_SECRET: z
      .string()
      .min(32)
      .default('development-only-access-token-secret-change-me'),
    AUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(3_600)
      .default(900),
    AUTH_EMAIL: z.string().email().default('admin@example.com'),
    AUTH_PASSWORD: z.string().min(8).default('change-me-in-development'),
    AUTH_REFRESH_TOKEN_COOKIE_NAME: z
      .string()
      .trim()
      .min(1)
      .default('payload_refresh_token'),
    AUTH_REFRESH_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(600)
      .max(2_592_000)
      .default(2_592_000),
    AUTH_TENANT_SLUG: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .default('demo'),
    AUTH_WORKSPACE_NAME: z.string().trim().min(1).max(200).default('Demo Workspace'),
    BILLING_DEFAULT_PLAN_KEY: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .default('free'),
    BILLING_EXISTING_TENANT_PLAN_KEY: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .default('legacy'),
    ANALYTICS_RETENTION_DAYS: z.coerce.number().int().min(1).max(3_650).default(365),
    DOMAIN_VERIFICATION_PREFIX: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]+$/i)
      .default('_payload-verification'),
    DOMAIN_VERIFICATION_PROVIDER: z.enum(['dns', 'fake']).default('dns'),
    PUBLIC_PLATFORM_ORIGIN: z.string().url().default('http://127.0.0.1:3002'),
    TRUST_PROXY: z.coerce.boolean().default(false),
    CORS_ORIGIN: z
      .string()
      .default(
        'http://localhost:3000,http://127.0.0.1:3000,http://localhost:3002,http://127.0.0.1:3002',
      ),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .default('info'),
    INTEGRATION_ALLOW_HTTP_WEBHOOKS: z.coerce.boolean().default(false),
    INTEGRATION_ALLOW_LOCAL_WEBHOOKS: z.coerce.boolean().default(false),
    INTEGRATION_EMAIL_PROVIDER: z.enum(['fake', 'resend']).default('fake'),
    INTEGRATION_SECRET_ENCRYPTION_KEY: z.string().min(32).optional(),
    RESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().email().optional(),
    MONGODB_URI: z
      .string()
      .refine(
        (value) => value.startsWith('mongodb://') || value.startsWith('mongodb+srv://'),
        'MONGODB_URI must be a MongoDB connection string',
      )
      .default('mongodb://127.0.0.1:27017/payload_landing_platform'),
    MONGODB_MASTER_DATABASE_NAME: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9_-]{1,63}$/)
      .default('payload_platform_master'),
    MONGODB_LEGACY_DATABASE_NAME: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9_-]{1,63}$/)
      .default('payload_landing_platform'),
    TENANT_CONNECTION_MAX_CACHED: z.coerce.number().int().min(1).max(10_000).default(100),
    TENANT_CONNECTION_IDLE_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(86_400)
      .default(900),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  })
  .superRefine((config, context) => {
    if (
      config.NODE_ENV === 'production' &&
      config.DOMAIN_VERIFICATION_PROVIDER === 'fake'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['DOMAIN_VERIFICATION_PROVIDER'],
        message: 'Fake domain verification is not allowed in production',
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function parseEnvironment(input: NodeJS.ProcessEnv): Environment {
  const result = environmentSchema.safeParse(input);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return result.data;
}

export const env = parseEnvironment(process.env);
