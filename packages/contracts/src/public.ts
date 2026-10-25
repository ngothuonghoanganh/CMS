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

/**
 * The consent texts of a page's lead form (ADR-017), with the business name filled in: the
 * release snapshot on live pages and release previews, the current settings in a draft preview.
 */
export const publicLeadCaptureSchema = z.object({
  requiredText: z.string(),
  marketingText: z.string().nullable(),
  policyUrl: z.url(),
});
export type PublicLeadCapture = z.infer<typeof publicLeadCaptureSchema>;

export const publicPageDataSchema = z.object({
  site: publicSiteSchema,
  page: publicPageSchema,
  /** The release shown; the lead form sends it back (ADR-016). Null in a draft preview. */
  releaseId: idSchema.nullable(),
  /** Null when the page has no form, or no consent settings yet (draft preview only). */
  leadCapture: publicLeadCaptureSchema.nullable(),
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

/**
 * What answers at a path, without any page data. The renderer's proxy asks this before rendering
 * so a miss is served as the server-rendered not-found page with status 404, and an old slug as a
 * 308 to `location` (ADR-009). A live page names its live release, which the renderer adds to the
 * page's cache key: when the pointer moves, the next request cannot be served the previous
 * release.
 */
export const pathStatusResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('page'), releaseId: idSchema }),
  z.object({ kind: z.literal('redirect'), location: z.string() }),
]);
export type PathStatusResponse = z.infer<typeof pathStatusResponseSchema>;

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
  /**
   * Live, indexable pages. `path` is absolute with a leading slash: "/" for the home page,
   * "/uu-dai" otherwise, so a URL is `${origin}${path}`.
   */
  entries: z.array(z.object({ path: z.string().startsWith('/'), lastModified: isoDateTimeSchema })),
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

/**
 * The renderer relays visitor requests (lead form, ADR-016) to the API with the visitor's address
 * and user agent in internal headers, signed with HMAC-SHA256 so the API can trust them. The
 * signature covers the method and path too, so a signed request cannot be replayed elsewhere.
 */
export const RENDERER_TIMESTAMP_HEADER = 'x-plp-renderer-timestamp';
export const RENDERER_SIGNATURE_HEADER = 'x-plp-renderer-signature';
export const CLIENT_IP_HEADER = 'x-plp-client-ip';
export const CLIENT_UA_HEADER = 'x-plp-client-ua';
export const RENDERER_MAX_SKEW_SECONDS = 300;
/** User agents are cut to this length before signing; the API reads no more. */
export const CLIENT_UA_MAX = 512;

export interface RendererSignatureInput {
  /** Unix seconds, as sent in `RENDERER_TIMESTAMP_HEADER`. */
  timestamp: string;
  method: string;
  /** Request path without query string, e.g. "/public/sites/smilecare/leads". */
  path: string;
  /** "" when the renderer could not trust any address. */
  clientIp: string;
  userAgent: string;
  body: string;
}

/** The exact text both apps sign; headers cannot hold line breaks, so lines keep fields apart. */
export function rendererSignaturePayload(input: RendererSignatureInput): string {
  return [
    input.timestamp,
    input.method.toUpperCase(),
    input.path,
    input.clientIp,
    input.userAgent,
    input.body,
  ].join('\n');
}
