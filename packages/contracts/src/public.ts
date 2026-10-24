import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';
import { compositionSchema } from './composition.js';
import { themePresetIdSchema } from './themes.js';

/** Contracts between the API and the renderer. They never carry draft or internal data. */
export const publicImageSchema = z.object({
  url: z.url(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type PublicImage = z.infer<typeof publicImageSchema>;

export const publicSiteSchema = z.object({
  id: idSchema,
  name: z.string(),
  subdomain: z.string(),
  themePresetId: themePresetIdSchema,
  logo: publicImageSchema.nullable(),
  origin: z.url(),
});
export type PublicSite = z.infer<typeof publicSiteSchema>;

export const publicSeoSchema = z.object({
  /** Resolved: falls back to the Hero heading, then the site name. */
  title: z.string(),
  description: z.string(),
  shareImage: publicImageSchema.nullable(),
  noindex: z.boolean(),
  canonicalUrl: z.url(),
});
export type PublicSeo = z.infer<typeof publicSeoSchema>;

export const publicPageSchema = z.object({
  id: idSchema,
  slug: z.string(),
  seo: publicSeoSchema,
  composition: compositionSchema,
});
export type PublicPage = z.infer<typeof publicPageSchema>;

export const publicPageDataSchema = z.object({
  site: publicSiteSchema,
  page: publicPageSchema,
  /** Every asset the composition references, by asset id. */
  assets: z.record(z.string(), publicImageSchema),
  /** Live path of every page the composition links to, null when that page is not live. */
  pageLinks: z.record(z.string(), z.string().nullable()),
});
export type PublicPageData = z.infer<typeof publicPageDataSchema>;

export const resolveQuerySchema = z.object({ path: z.string().max(200).default('') });

export const resolveResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('page'), data: publicPageDataSchema }),
  z.object({ kind: z.literal('redirect'), location: z.string() }),
]);
export type ResolveResponse = z.infer<typeof resolveResponseSchema>;

export const publicPreviewResponseSchema = z.object({
  data: publicPageDataSchema,
  preview: z.object({
    kind: z.enum(['draft', 'release']),
    version: z.number().int().positive().nullable(),
    expiresAt: isoDateTimeSchema,
  }),
});
export type PublicPreviewResponse = z.infer<typeof publicPreviewResponseSchema>;

export const sitemapResponseSchema = z.object({
  origin: z.url(),
  entries: z.array(z.object({ path: z.string(), lastModified: isoDateTimeSchema })),
});
export type SitemapResponse = z.infer<typeof sitemapResponseSchema>;

/** Renderer cache tag for everything served on one site. */
export function siteCacheTag(subdomain: string): string {
  return `site:${subdomain}`;
}

export const REVALIDATE_SIGNATURE_HEADER = 'x-plp-signature';
export const REVALIDATE_TIMESTAMP_HEADER = 'x-plp-timestamp';
/** Signed requests older than this are rejected to prevent replay. */
export const REVALIDATE_MAX_SKEW_SECONDS = 300;

export const revalidateRequestSchema = z.object({
  tags: z.array(z.string().min(1).max(256)).min(1).max(20),
});
export type RevalidateRequest = z.infer<typeof revalidateRequestSchema>;
