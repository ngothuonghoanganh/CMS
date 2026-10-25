import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';
import { DEFAULT_THEME_PRESET, themePresetIdSchema } from './themes.js';

export const reservedSubdomains: readonly string[] = [
  'www',
  'api',
  'admin',
  'app',
  'assets',
  'static',
  'cdn',
  'mail',
  'preview',
  'status',
  'help',
  'docs',
  'support',
  'blog',
  'dashboard',
  'login',
  'signup',
];

export function isReservedSubdomain(value: string): boolean {
  return reservedSubdomains.includes(value);
}

/** Format rules only; `subdomainSchema` adds the reserved-name rule. */
export const subdomainFormatSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Tên miền con cần ít nhất 3 ký tự')
  .max(40, 'Tên miền con tối đa 40 ký tự')
  .regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
    'Chỉ dùng chữ thường không dấu, số và dấu gạch ngang; không bắt đầu hay kết thúc bằng gạch ngang',
  )
  .refine((value) => !value.includes('--'), 'Không dùng hai dấu gạch ngang liền nhau');

export const subdomainSchema = subdomainFormatSchema.refine(
  (value) => !isReservedSubdomain(value),
  'Tên này được hệ thống giữ lại, hãy chọn tên khác',
);

export const siteNameSchema = z
  .string()
  .trim()
  .min(1, 'Nhập tên site')
  .max(80, 'Tên site tối đa 80 ký tự');

export const siteSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  name: z.string(),
  subdomain: z.string(),
  themePresetId: themePresetIdSchema,
  logoAssetId: idSchema.nullable(),
  defaultShareImageAssetId: idSchema.nullable(),
  /** Public origin of the default domain, e.g. https://smilecare.payload.site */
  defaultOrigin: z.url(),
  /** The owner saved the personal data settings (ADR-017). */
  privacyConfigured: z.boolean(),
  /** Addresses that confirmed they receive leads (ADR-018); a form needs at least one. */
  confirmedLeadRecipients: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
});
export type Site = z.infer<typeof siteSchema>;

/**
 * Upper bound on sites per workspace (ADR-014): the site list, which every workspace screen loads
 * for the site switcher, stays bounded.
 */
export const MAX_SITES_PER_WORKSPACE = 100;

export const siteListResponseSchema = z.object({ items: z.array(siteSchema) });
export type SiteListResponse = z.infer<typeof siteListResponseSchema>;

export const createSiteRequestSchema = z.object({
  name: siteNameSchema,
  subdomain: subdomainSchema,
  themePresetId: themePresetIdSchema.default(DEFAULT_THEME_PRESET),
});
export type CreateSiteRequest = z.input<typeof createSiteRequestSchema>;

export const updateSiteRequestSchema = z
  .object({
    name: siteNameSchema,
    themePresetId: themePresetIdSchema,
    logoAssetId: idSchema.nullable(),
    defaultShareImageAssetId: idSchema.nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Không có thay đổi nào để lưu');
export type UpdateSiteRequest = z.infer<typeof updateSiteRequestSchema>;

export const subdomainAvailabilityQuerySchema = z.object({ subdomain: z.string().max(100) });

export const subdomainAvailabilitySchema = z.object({
  subdomain: z.string(),
  available: z.boolean(),
  reason: z.enum(['invalid', 'reserved', 'taken']).nullable(),
  message: z.string().nullable(),
});
export type SubdomainAvailability = z.infer<typeof subdomainAvailabilitySchema>;
