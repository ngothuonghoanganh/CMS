import type { z } from 'zod';
import { activityListResponseSchema } from './activity.js';
import { assetListResponseSchema, assetSchema, updateAssetRequestSchema } from './asset.js';
import { loginRequestSchema, meResponseSchema, signupRequestSchema } from './auth.js';
import { checksResultSchema } from './checks.js';
import { cursorQuerySchema } from './common.js';
import { healthResponseSchema } from './health.js';
import {
  createPageRequestSchema,
  pageDetailResponseSchema,
  pageListQuerySchema,
  pageListResponseSchema,
  restoreDraftRequestSchema,
  saveDraftRequestSchema,
  saveDraftResponseSchema,
  slugAvailabilityQuerySchema,
  slugAvailabilitySchema,
} from './page.js';
import { createPreviewLinkRequestSchema, previewLinkResponseSchema } from './preview.js';
import {
  publicPreviewResponseSchema,
  resolveQuerySchema,
  resolveResponseSchema,
  sitemapResponseSchema,
} from './public.js';
import {
  historyResponseSchema,
  pointerMoveRequestSchema,
  pointerMoveResponseSchema,
  publishRequestSchema,
  publishResponseSchema,
} from './release.js';
import {
  createSiteRequestSchema,
  siteListResponseSchema,
  siteSchema,
  subdomainAvailabilityQuerySchema,
  subdomainAvailabilitySchema,
  updateSiteRequestSchema,
} from './site.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface EndpointDefinition<
  Args extends readonly string[],
  Req extends z.ZodType | null,
  Query extends z.ZodType | null,
  Res extends z.ZodType | null,
> {
  method: HttpMethod;
  path: (...args: Args) => string;
  /** JSON body schema; null for no body (or multipart, see the endpoint's comment). */
  request: Req;
  query: Query;
  /** Success body schema; null for 204 No Content. */
  response: Res;
}

function endpoint<
  const Args extends readonly string[],
  Req extends z.ZodType | null,
  Query extends z.ZodType | null,
  Res extends z.ZodType | null,
>(
  definition: EndpointDefinition<Args, Req, Query, Res>,
): EndpointDefinition<Args, Req, Query, Res> {
  return definition;
}

const e = encodeURIComponent;

/**
 * Every HTTP endpoint of the API. Paths are relative to the API root; the admin reaches them
 * through its `/api` proxy. Authenticated endpoints use the session cookie.
 */
export const endpoints = {
  health: endpoint({
    method: 'GET',
    path: () => '/health',
    request: null,
    query: null,
    response: healthResponseSchema,
  }),

  // Auth
  signup: endpoint({
    method: 'POST',
    path: () => '/auth/signup',
    request: signupRequestSchema,
    query: null,
    response: meResponseSchema,
  }),
  login: endpoint({
    method: 'POST',
    path: () => '/auth/login',
    request: loginRequestSchema,
    query: null,
    response: meResponseSchema,
  }),
  logout: endpoint({
    method: 'POST',
    path: () => '/auth/logout',
    request: null,
    query: null,
    response: null,
  }),
  me: endpoint({
    method: 'GET',
    path: () => '/auth/me',
    request: null,
    query: null,
    response: meResponseSchema,
  }),

  // Sites
  listSites: endpoint({
    method: 'GET',
    path: (workspaceId: string) => `/workspaces/${e(workspaceId)}/sites`,
    request: null,
    query: null,
    response: siteListResponseSchema,
  }),
  createSite: endpoint({
    method: 'POST',
    path: (workspaceId: string) => `/workspaces/${e(workspaceId)}/sites`,
    request: createSiteRequestSchema,
    query: null,
    response: siteSchema,
  }),
  subdomainAvailability: endpoint({
    method: 'GET',
    path: () => '/sites/subdomain-availability',
    request: null,
    query: subdomainAvailabilityQuerySchema,
    response: subdomainAvailabilitySchema,
  }),
  getSite: endpoint({
    method: 'GET',
    path: (siteId: string) => `/sites/${e(siteId)}`,
    request: null,
    query: null,
    response: siteSchema,
  }),
  updateSite: endpoint({
    method: 'PATCH',
    path: (siteId: string) => `/sites/${e(siteId)}`,
    request: updateSiteRequestSchema,
    query: null,
    response: siteSchema,
  }),

  // Pages and drafts
  listPages: endpoint({
    method: 'GET',
    path: (siteId: string) => `/sites/${e(siteId)}/pages`,
    request: null,
    query: pageListQuerySchema,
    response: pageListResponseSchema,
  }),
  createPage: endpoint({
    method: 'POST',
    path: (siteId: string) => `/sites/${e(siteId)}/pages`,
    request: createPageRequestSchema,
    query: null,
    response: pageDetailResponseSchema,
  }),
  slugAvailability: endpoint({
    method: 'GET',
    path: (siteId: string) => `/sites/${e(siteId)}/slug-availability`,
    request: null,
    query: slugAvailabilityQuerySchema,
    response: slugAvailabilitySchema,
  }),
  getPage: endpoint({
    method: 'GET',
    path: (pageId: string) => `/pages/${e(pageId)}`,
    request: null,
    query: null,
    response: pageDetailResponseSchema,
  }),
  saveDraft: endpoint({
    method: 'PUT',
    path: (pageId: string) => `/pages/${e(pageId)}/draft`,
    request: saveDraftRequestSchema,
    query: null,
    response: saveDraftResponseSchema,
  }),
  restoreDraft: endpoint({
    method: 'POST',
    path: (pageId: string) => `/pages/${e(pageId)}/draft/restore`,
    request: restoreDraftRequestSchema,
    query: null,
    response: pageDetailResponseSchema,
  }),

  // Publishing
  getChecks: endpoint({
    method: 'GET',
    path: (pageId: string) => `/pages/${e(pageId)}/checks`,
    request: null,
    query: null,
    response: checksResultSchema,
  }),
  /** Requires the `Idempotency-Key` header. */
  publish: endpoint({
    method: 'POST',
    path: (pageId: string) => `/pages/${e(pageId)}/releases`,
    request: publishRequestSchema,
    query: null,
    response: publishResponseSchema,
  }),
  history: endpoint({
    method: 'GET',
    path: (pageId: string) => `/pages/${e(pageId)}/history`,
    request: null,
    query: cursorQuerySchema,
    response: historyResponseSchema,
  }),
  /** Rollback (target = older release) or unpublish (target = null). */
  movePointer: endpoint({
    method: 'POST',
    path: (pageId: string) => `/pages/${e(pageId)}/pointer`,
    request: pointerMoveRequestSchema,
    query: null,
    response: pointerMoveResponseSchema,
  }),
  undoActivity: endpoint({
    method: 'POST',
    path: (activityId: string) => `/activity/${e(activityId)}/undo`,
    request: null,
    query: null,
    response: pointerMoveResponseSchema,
  }),
  createPreviewLink: endpoint({
    method: 'POST',
    path: (pageId: string) => `/pages/${e(pageId)}/preview-links`,
    request: createPreviewLinkRequestSchema,
    query: null,
    response: previewLinkResponseSchema,
  }),

  // Activity
  listActivity: endpoint({
    method: 'GET',
    path: (siteId: string) => `/sites/${e(siteId)}/activity`,
    request: null,
    query: cursorQuerySchema,
    response: activityListResponseSchema,
  }),

  // Assets
  listAssets: endpoint({
    method: 'GET',
    path: (siteId: string) => `/sites/${e(siteId)}/assets`,
    request: null,
    query: cursorQuerySchema,
    response: assetListResponseSchema,
  }),
  /** multipart/form-data: `file` plus the fields of `uploadAssetFieldsSchema`. */
  uploadAsset: endpoint({
    method: 'POST',
    path: (siteId: string) => `/sites/${e(siteId)}/assets`,
    request: null,
    query: null,
    response: assetSchema,
  }),
  updateAsset: endpoint({
    method: 'PATCH',
    path: (assetId: string) => `/assets/${e(assetId)}`,
    request: updateAssetRequestSchema,
    query: null,
    response: assetSchema,
  }),

  // Public delivery (renderer only; no session)
  publicResolve: endpoint({
    method: 'GET',
    path: (subdomain: string) => `/public/sites/${e(subdomain)}/resolve`,
    request: null,
    query: resolveQuerySchema,
    response: resolveResponseSchema,
  }),
  publicSitemap: endpoint({
    method: 'GET',
    path: (subdomain: string) => `/public/sites/${e(subdomain)}/sitemap`,
    request: null,
    query: null,
    response: sitemapResponseSchema,
  }),
  publicPreview: endpoint({
    method: 'GET',
    path: (token: string) => `/public/preview/${e(token)}`,
    request: null,
    query: null,
    response: publicPreviewResponseSchema,
  }),
} as const;

export type Endpoints = typeof endpoints;
