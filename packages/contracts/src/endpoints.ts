import type { z } from 'zod';
import { activityListQuerySchema, activityListResponseSchema } from './activity.js';
import { analyticsQuerySchema, analyticsReportSchema, pageViewSchema } from './analytics.js';
import {
  assetListQuerySchema,
  assetListResponseSchema,
  assetSchema,
  updateAssetRequestSchema,
} from './asset.js';
import { loginRequestSchema, meResponseSchema, signupRequestSchema } from './auth.js';
import { checksResultSchema } from './checks.js';
import { cursorQuerySchema } from './common.js';
import {
  createDataRequestRequestSchema,
  dataRequestDetailSchema,
  dataRequestListQuerySchema,
  dataRequestListResponseSchema,
} from './data-request.js';
import { healthResponseSchema } from './health.js';
import { publicLeadRequestSchema, publicLeadResponseSchema } from './lead.js';
import {
  leadCountsSchema,
  leadDetailSchema,
  leadFiltersSchema,
  leadListQuerySchema,
  leadListResponseSchema,
  leadSearchRequestSchema,
  pageRefListResponseSchema,
  personDeleteResponseSchema,
  personExportRequestSchema,
  updateLeadContactRequestSchema,
  updateLeadRequestSchema,
} from './lead-inbox.js';
import {
  createPageRequestSchema,
  pageDetailResponseSchema,
  pageCountResponseSchema,
  pageListQuerySchema,
  pageListResponseSchema,
  restoreDraftRequestSchema,
  saveDraftRequestSchema,
  saveDraftResponseSchema,
  slugAvailabilityQuerySchema,
  slugAvailabilitySchema,
} from './page.js';
import {
  addLeadRecipientRequestSchema,
  confirmLeadRecipientRequestSchema,
  confirmLeadRecipientResponseSchema,
  leadRecipientListResponseSchema,
  leadRecipientSchema,
} from './lead-recipients.js';
import { createPreviewLinkRequestSchema, previewLinkResponseSchema } from './preview.js';
import {
  consentVersionListQuerySchema,
  consentVersionListResponseSchema,
  consentVersionSchema,
  createConsentVersionRequestSchema,
  privacySettingsSchema,
  updatePrivacyRequestSchema,
} from './privacy.js';
import {
  pathStatusResponseSchema,
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
  /** Success body schema; null for 204 No Content (or a file, see the endpoint's comment). */
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

  // Personal data and consent (ADR-017): every member reads, the owner writes
  getPrivacySettings: endpoint({
    method: 'GET',
    path: (siteId: string) => `/sites/${e(siteId)}/privacy`,
    request: null,
    query: null,
    response: privacySettingsSchema,
  }),
  updatePrivacySettings: endpoint({
    method: 'PUT',
    path: (siteId: string) => `/sites/${e(siteId)}/privacy`,
    request: updatePrivacyRequestSchema,
    query: null,
    response: privacySettingsSchema,
  }),
  /** Newest first. */
  listConsentVersions: endpoint({
    method: 'GET',
    path: (siteId: string) => `/sites/${e(siteId)}/consent-versions`,
    request: null,
    query: consentVersionListQuerySchema,
    response: consentVersionListResponseSchema,
  }),
  /** 409 `conflict` when `baseVersion` is no longer the latest version. */
  createConsentVersion: endpoint({
    method: 'POST',
    path: (siteId: string) => `/sites/${e(siteId)}/consent-versions`,
    request: createConsentVersionRequestSchema,
    query: null,
    response: consentVersionSchema,
  }),

  // Lead inbox (ADR-018): members read and triage leads, the owner exports and deletes them
  /** Newest first, with the folder counts for the same filters; `searchLeads` adds a search. */
  listLeads: endpoint({
    method: 'GET',
    path: (siteId: string) => `/sites/${e(siteId)}/leads`,
    request: null,
    query: leadListQuerySchema,
    response: leadListResponseSchema,
  }),
  /**
   * `listLeads` narrowed by a search. A POST because the search is personal data (a phone number,
   * email or name) that must stay out of URLs, access logs and the Referer header (rule 10).
   */
  searchLeads: endpoint({
    method: 'POST',
    path: (siteId: string) => `/sites/${e(siteId)}/leads/search`,
    request: leadSearchRequestSchema,
    query: null,
    response: leadListResponseSchema,
  }),
  /** The sidebar badge "N mới" and the dashboard card "Lead 7 ngày qua". */
  leadCounts: endpoint({
    method: 'GET',
    path: (siteId: string) => `/sites/${e(siteId)}/lead-counts`,
    request: null,
    query: null,
    response: leadCountsSchema,
  }),
  /**
   * Owner only. A CSV file (UTF-8 with BOM) of the leads matching the filters, newest first, at
   * most `LEAD_EXPORT_MAX_ROWS`; `EXPORT_TRUNCATED_HEADER` tells whether more matched.
   */
  exportLeads: endpoint({
    method: 'POST',
    path: (siteId: string) => `/sites/${e(siteId)}/leads/export`,
    request: leadFiltersSchema,
    query: null,
    response: null,
  }),
  getLead: endpoint({
    method: 'GET',
    path: (leadId: string) => `/leads/${e(leadId)}`,
    request: null,
    query: null,
    response: leadDetailSchema,
  }),
  /** Status, internal note, or moving to and from "Nghi ngờ spam". */
  updateLead: endpoint({
    method: 'PATCH',
    path: (leadId: string) => `/leads/${e(leadId)}`,
    request: updateLeadRequestSchema,
    query: null,
    response: leadDetailSchema,
  }),
  /** Owner only: the lead's name, phone number and email, e.g. for a request to correct them. */
  updateLeadContact: endpoint({
    method: 'PATCH',
    path: (leadId: string) => `/leads/${e(leadId)}/contact`,
    request: updateLeadContactRequestSchema,
    query: null,
    response: leadDetailSchema,
  }),
  /**
   * Owner only. A JSON or CSV file with every lead of the same person (phone number or email) in
   * the site, consent evidence included; at most `LEAD_PERSON_EXPORT_MAX` leads.
   */
  exportLeadPerson: endpoint({
    method: 'POST',
    path: (leadId: string) => `/leads/${e(leadId)}/person/export`,
    request: personExportRequestSchema,
    query: null,
    response: null,
  }),
  /**
   * Owner only. Deletes every lead of the same person in the site. Copies already sent by email
   * are not deleted (ADR-017).
   */
  deleteLeadPerson: endpoint({
    method: 'DELETE',
    path: (leadId: string) => `/leads/${e(leadId)}/person`,
    request: null,
    query: null,
    response: personDeleteResponseSchema,
  }),

  /** Members: sends the lead's email notification again after it failed (ADR-018). */
  retryLeadNotification: endpoint({
    method: 'POST',
    path: (leadId: string) => `/leads/${e(leadId)}/notification/retry`,
    request: null,
    query: null,
    response: leadDetailSchema,
  }),

  // Analytics (ADR-019)
  /**
   * Renderer only, signed (ADR-016): one view of a live page. Always 204: a view that is not
   * counted (a bot, a page that is not live, over the rate limit) is not an error for the visitor.
   */
  publicRecordPageView: endpoint({
    method: 'POST',
    path: (subdomain: string) => `/public/sites/${e(subdomain)}/events`,
    request: pageViewSchema,
    query: null,
    response: null,
  }),
  /** Members: "Hiệu quả" for a range, of the site or one page. */
  analyticsReport: endpoint({
    method: 'GET',
    path: (siteId: string) => `/sites/${e(siteId)}/analytics`,
    request: null,
    query: analyticsQuerySchema,
    response: analyticsReportSchema,
  }),

  // Requests from people who sent a form (ADR-017): owner only
  listDataRequests: endpoint({
    method: 'GET',
    path: (siteId: string) => `/sites/${e(siteId)}/data-requests`,
    request: null,
    query: dataRequestListQuerySchema,
    response: dataRequestListResponseSchema,
  }),
  /** Records a request received by email or phone; the deadlines count from `receivedAt`. */
  createDataRequest: endpoint({
    method: 'POST',
    path: (siteId: string) => `/sites/${e(siteId)}/data-requests`,
    request: createDataRequestRequestSchema,
    query: null,
    response: dataRequestDetailSchema,
  }),
  getDataRequest: endpoint({
    method: 'GET',
    path: (requestId: string) => `/data-requests/${e(requestId)}`,
    request: null,
    query: null,
    response: dataRequestDetailSchema,
  }),
  /** The person was answered. 409 `conflict` unless the request is `open`. */
  respondDataRequest: endpoint({
    method: 'POST',
    path: (requestId: string) => `/data-requests/${e(requestId)}/respond`,
    request: null,
    query: null,
    response: dataRequestDetailSchema,
  }),
  /**
   * A request to see the stored data: the person's leads as a JSON or CSV file, like
   * `exportLeadPerson`. 409 `conflict` for another type or a completed request.
   */
  exportDataRequest: endpoint({
    method: 'POST',
    path: (requestId: string) => `/data-requests/${e(requestId)}/export`,
    request: personExportRequestSchema,
    query: null,
    response: null,
  }),
  /**
   * Completes the request. A deletion deletes the person's leads and masks the contact; a
   * withdrawal records the withdrawn marketing consent on their leads; both in the same
   * transaction. 409 `conflict` when the request is already completed.
   */
  completeDataRequest: endpoint({
    method: 'POST',
    path: (requestId: string) => `/data-requests/${e(requestId)}/complete`,
    request: null,
    query: null,
    response: dataRequestDetailSchema,
  }),

  // Lead recipients (ADR-018): members read them, the owner changes them
  listLeadRecipients: endpoint({
    method: 'GET',
    path: (siteId: string) => `/sites/${e(siteId)}/lead-recipients`,
    request: null,
    query: null,
    response: leadRecipientListResponseSchema,
  }),
  /**
   * Adds an address and emails it a confirmation link. 201 even when that email could not be
   * sent: the recipient is then `unsent`. 409 `recipient_exists` or `recipient_limit_reached`.
   */
  addLeadRecipient: endpoint({
    method: 'POST',
    path: (siteId: string) => `/sites/${e(siteId)}/lead-recipients`,
    request: addLeadRecipientRequestSchema,
    query: null,
    response: leadRecipientSchema,
  }),
  /** A new confirmation link; the previous one stops working. */
  resendLeadRecipient: endpoint({
    method: 'POST',
    path: (siteId: string, recipientId: string) =>
      `/sites/${e(siteId)}/lead-recipients/${e(recipientId)}/resend`,
    request: null,
    query: null,
    response: leadRecipientSchema,
  }),
  removeLeadRecipient: endpoint({
    method: 'DELETE',
    path: (siteId: string, recipientId: string) =>
      `/sites/${e(siteId)}/lead-recipients/${e(recipientId)}`,
    request: null,
    query: null,
    response: null,
  }),
  /**
   * No session: the person who received the link confirms it. 404 when the link is unknown,
   * already used or expired.
   */
  confirmLeadRecipient: endpoint({
    method: 'POST',
    path: () => '/public/lead-recipients/confirm',
    request: confirmLeadRecipientRequestSchema,
    query: null,
    response: confirmLeadRecipientResponseSchema,
  }),

  // Pages and drafts
  listPages: endpoint({
    method: 'GET',
    path: (siteId: string) => `/sites/${e(siteId)}/pages`,
    request: null,
    query: pageListQuerySchema,
    response: pageListResponseSchema,
  }),
  /** Id and title of every page of the site, by title: the page filter of the lead inbox. */
  listPageRefs: endpoint({
    method: 'GET',
    path: (siteId: string) => `/sites/${e(siteId)}/page-refs`,
    request: null,
    query: null,
    response: pageRefListResponseSchema,
  }),
  /** `counts.all` of `listPages` without evaluating every page. */
  countPages: endpoint({
    method: 'GET',
    path: (siteId: string) => `/sites/${e(siteId)}/page-count`,
    request: null,
    query: null,
    response: pageCountResponseSchema,
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
  /** Events of the site, newest first; `types` narrows them (see `activityListQuerySchema`). */
  listActivity: endpoint({
    method: 'GET',
    path: (siteId: string) => `/sites/${e(siteId)}/activity`,
    request: null,
    query: activityListQuerySchema,
    response: activityListResponseSchema,
  }),

  // Assets
  /** Pages the library, or looks up specific assets with `ids` (see `assetListQuerySchema`). */
  listAssets: endpoint({
    method: 'GET',
    path: (siteId: string) => `/sites/${e(siteId)}/assets`,
    request: null,
    query: assetListQuerySchema,
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
  /** 200 when a live page or a redirect answers at `path`, 404 otherwise; no page data. */
  publicPathStatus: endpoint({
    method: 'GET',
    path: (subdomain: string) => `/public/sites/${e(subdomain)}/path-status`,
    request: null,
    query: resolveQuerySchema,
    response: pathStatusResponseSchema,
  }),
  publicSitemap: endpoint({
    method: 'GET',
    path: (subdomain: string) => `/public/sites/${e(subdomain)}/sitemap`,
    request: null,
    query: null,
    response: sitemapResponseSchema,
  }),
  /**
   * A visitor's lead (ADR-016), relayed by the renderer's `/_lead` route and signed with the
   * renderer channel headers; 201 for a new lead, 200 when the submission was already received.
   */
  publicSubmitLead: endpoint({
    method: 'POST',
    path: (subdomain: string) => `/public/sites/${e(subdomain)}/leads`,
    request: publicLeadRequestSchema,
    query: null,
    response: publicLeadResponseSchema,
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
