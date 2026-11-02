import type { z } from 'zod';
import { activityListQuerySchema, activityListResponseSchema } from './activity.js';
import { aiJobSchema, aiPageJobRequestSchema, aiUsageSchema } from './ai.js';
import { analyticsQuerySchema, analyticsReportSchema, pageViewSchema } from './analytics.js';
import {
  assetListQuerySchema,
  assetListResponseSchema,
  assetSchema,
  updateAssetRequestSchema,
} from './asset.js';
import {
  accountEmailRequestSchema,
  accountEmailResponseSchema,
  changePasswordRequestSchema,
  loginRequestSchema,
  resetPasswordRequestSchema,
  signupLookupRequestSchema,
  signupLookupResponseSchema,
  signupRequestSchema,
  signupVerifyRequestSchema,
  updateMeRequestSchema,
} from './auth.js';
import { meResponseSchema } from './membership.js';
import {
  acceptInvitationResponseSchema,
  accessGrantSchema,
  accessRequestListResponseSchema,
  createAccessRequestSchema,
  createInvitationsRequestSchema,
  createInvitationsResponseSchema,
  invitationListResponseSchema,
  invitationLookupResponseSchema,
  invitationSchema,
  invitationTokenRequestSchema,
  invitedSignupRequestSchema,
  memberListResponseSchema,
  memberSchema,
  myAccessRequestResponseSchema,
  transferOwnershipRequestSchema,
} from './members.js';
import { roleCountsSchema } from './permissions.js';
import {
  customRoleInputSchema,
  customRoleListResponseSchema,
  customRoleSchema,
} from './custom-roles.js';
import { checksResultSchema } from './checks.js';
import { cursorQuerySchema } from './common.js';
import {
  createDataRequestRequestSchema,
  dataRequestDetailSchema,
  dataRequestListQuerySchema,
  dataRequestListResponseSchema,
} from './data-request.js';
import {
  addDomainRequestSchema,
  domainAvailabilityQuerySchema,
  domainAvailabilitySchema,
  domainListResponseSchema,
  domainSchema,
  hostSiteResponseSchema,
  setPrimaryDomainRequestSchema,
  siteAddressResponseSchema,
  siteAddressStatusSchema,
} from './domains.js';
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
  publicPreviewStatusResponseSchema,
  resolveQuerySchema,
  resolveResponseSchema,
  sitemapResponseSchema,
} from './public.js';
import {
  approvalResponseSchema,
  historyResponseSchema,
  pointerMoveRequestSchema,
  pointerMoveResponseSchema,
  publishRequestSchema,
  publishResponseSchema,
  rejectApprovalSchema,
  requestApprovalSchema,
} from './release.js';
import {
  createSiteRequestSchema,
  deleteSiteRequestSchema,
  siteDeletionSummarySchema,
  siteListResponseSchema,
  siteSchema,
  subdomainAvailabilityQuerySchema,
  subdomainAvailabilitySchema,
  updateSiteRequestSchema,
} from './site.js';
import {
  templateDetailQuerySchema,
  templateDetailSchema,
  templateListResponseSchema,
} from './templates.js';

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
  /** 202: emails a confirmation link; the account exists once it is confirmed (ADR-026). */
  signup: endpoint({
    method: 'POST',
    path: () => '/auth/signup',
    request: signupRequestSchema,
    query: null,
    response: accountEmailResponseSchema,
  }),
  /** The sign-up a confirmation link names, for its page; 410 when the link no longer works. */
  lookupSignup: endpoint({
    method: 'POST',
    path: () => '/auth/signup/lookup',
    request: signupLookupRequestSchema,
    query: null,
    response: signupLookupResponseSchema,
  }),
  /** The link's secret and a password: creates the account and its workspace, then signs in. */
  verifySignup: endpoint({
    method: 'POST',
    path: () => '/auth/signup/verify',
    request: signupVerifyRequestSchema,
    query: null,
    response: meResponseSchema,
  }),
  /** 202 always: a new link for a sign-up still waiting for its confirmation. */
  resendSignup: endpoint({
    method: 'POST',
    path: () => '/auth/signup/resend',
    request: accountEmailRequestSchema,
    query: null,
    response: accountEmailResponseSchema,
  }),
  /** 202 always: a reset link, when the email has an account. */
  forgotPassword: endpoint({
    method: 'POST',
    path: () => '/auth/password/forgot',
    request: accountEmailRequestSchema,
    query: null,
    response: accountEmailResponseSchema,
  }),
  /** The link's secret and a new password: ends every session, then signs in. */
  resetPassword: endpoint({
    method: 'POST',
    path: () => '/auth/password/reset',
    request: resetPasswordRequestSchema,
    query: null,
    response: meResponseSchema,
  }),
  /** The signed-in user's password; their other sessions end. */
  changePassword: endpoint({
    method: 'POST',
    path: () => '/auth/password',
    request: changePasswordRequestSchema,
    query: null,
    response: null,
  }),
  updateMe: endpoint({
    method: 'PATCH',
    path: () => '/auth/me',
    request: updateMeRequestSchema,
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

  // Workspace roles (ADR-020)
  /** Custom roles of the workspace with who holds them (board 16, ADR-024). */
  listCustomRoles: endpoint({
    method: 'GET',
    path: (workspaceId: string) => `/workspaces/${e(workspaceId)}/custom-roles`,
    request: null,
    query: null,
    response: customRoleListResponseSchema,
  }),
  createCustomRole: endpoint({
    method: 'POST',
    path: (workspaceId: string) => `/workspaces/${e(workspaceId)}/custom-roles`,
    request: customRoleInputSchema,
    query: null,
    response: customRoleSchema,
  }),
  updateCustomRole: endpoint({
    method: 'PATCH',
    path: (workspaceId: string, roleId: string) =>
      `/workspaces/${e(workspaceId)}/custom-roles/${e(roleId)}`,
    request: customRoleInputSchema,
    query: null,
    response: customRoleSchema,
  }),
  /** Only while nobody holds it and no pending invitation offers it. */
  deleteCustomRole: endpoint({
    method: 'DELETE',
    path: (workspaceId: string, roleId: string) =>
      `/workspaces/${e(workspaceId)}/custom-roles/${e(roleId)}`,
    request: null,
    query: null,
    response: null,
  }),
  roleCounts: endpoint({
    method: 'GET',
    path: (workspaceId: string) => `/workspaces/${e(workspaceId)}/role-counts`,
    request: null,
    query: null,
    response: roleCountsSchema,
  }),

  // Members (ADR-021): `members.manage`, except where noted
  listMembers: endpoint({
    method: 'GET',
    path: (workspaceId: string) => `/workspaces/${e(workspaceId)}/members`,
    request: null,
    query: null,
    response: memberListResponseSchema,
  }),
  updateMember: endpoint({
    method: 'PATCH',
    path: (workspaceId: string, userId: string) =>
      `/workspaces/${e(workspaceId)}/members/${e(userId)}`,
    request: accessGrantSchema,
    query: null,
    response: memberSchema,
  }),
  removeMember: endpoint({
    method: 'DELETE',
    path: (workspaceId: string, userId: string) =>
      `/workspaces/${e(workspaceId)}/members/${e(userId)}`,
    request: null,
    query: null,
    response: null,
  }),
  /** `workspace.transferOwnership`: the receiver must be a Quản trị. */
  transferOwnership: endpoint({
    method: 'POST',
    path: (workspaceId: string) => `/workspaces/${e(workspaceId)}/ownership`,
    request: transferOwnershipRequestSchema,
    query: null,
    response: memberListResponseSchema,
  }),
  listInvitations: endpoint({
    method: 'GET',
    path: (workspaceId: string) => `/workspaces/${e(workspaceId)}/invitations`,
    request: null,
    query: null,
    response: invitationListResponseSchema,
  }),
  createInvitations: endpoint({
    method: 'POST',
    path: (workspaceId: string) => `/workspaces/${e(workspaceId)}/invitations`,
    request: createInvitationsRequestSchema,
    query: null,
    response: createInvitationsResponseSchema,
  }),
  /** A new link, valid 7 days again; the old link stops working. */
  resendInvitation: endpoint({
    method: 'POST',
    path: (workspaceId: string, invitationId: string) =>
      `/workspaces/${e(workspaceId)}/invitations/${e(invitationId)}/resend`,
    request: null,
    query: null,
    response: invitationSchema,
  }),
  revokeInvitation: endpoint({
    method: 'DELETE',
    path: (workspaceId: string, invitationId: string) =>
      `/workspaces/${e(workspaceId)}/invitations/${e(invitationId)}`,
    request: null,
    query: null,
    response: null,
  }),
  /** No session: what the invitation page shows to whoever holds the link. */
  lookupInvitation: endpoint({
    method: 'POST',
    path: () => '/public/invitations/lookup',
    request: invitationTokenRequestSchema,
    query: null,
    response: invitationLookupResponseSchema,
  }),
  /** No session: creates the account of the invited email, joins the workspace, signs in. */
  signupInvited: endpoint({
    method: 'POST',
    path: () => '/auth/signup/invited',
    request: invitedSignupRequestSchema,
    query: null,
    response: meResponseSchema,
  }),
  /** The signed-in user, whose email must be the invited one. */
  acceptInvitation: endpoint({
    method: 'POST',
    path: () => '/invitations/accept',
    request: invitationTokenRequestSchema,
    query: null,
    response: acceptInvitationResponseSchema,
  }),
  declineInvitation: endpoint({
    method: 'POST',
    path: () => '/invitations/decline',
    request: invitationTokenRequestSchema,
    query: null,
    response: null,
  }),
  /** `accessRequests.decide`: the pending requests of the workspace. */
  listAccessRequests: endpoint({
    method: 'GET',
    path: (workspaceId: string) => `/workspaces/${e(workspaceId)}/access-requests`,
    request: null,
    query: null,
    response: accessRequestListResponseSchema,
  }),
  /** Any member: their own pending request. */
  myAccessRequest: endpoint({
    method: 'GET',
    path: (workspaceId: string) => `/workspaces/${e(workspaceId)}/access-requests/mine`,
    request: null,
    query: null,
    response: myAccessRequestResponseSchema,
  }),
  /** Members without `members.manage`: asks Chủ sở hữu for another role, by email. */
  createAccessRequest: endpoint({
    method: 'POST',
    path: (workspaceId: string) => `/workspaces/${e(workspaceId)}/access-requests`,
    request: createAccessRequestSchema,
    query: null,
    response: myAccessRequestResponseSchema,
  }),
  /** `accessRequests.decide`: gives the member the role and sites decided, which may differ. */
  acceptAccessRequest: endpoint({
    method: 'POST',
    path: (workspaceId: string, requestId: string) =>
      `/workspaces/${e(workspaceId)}/access-requests/${e(requestId)}/accept`,
    request: accessGrantSchema,
    query: null,
    response: memberSchema,
  }),
  declineAccessRequest: endpoint({
    method: 'POST',
    path: (workspaceId: string, requestId: string) =>
      `/workspaces/${e(workspaceId)}/access-requests/${e(requestId)}/decline`,
    request: null,
    query: null,
    response: null,
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
  /**
   * `sites.manage` and `personalData.manage` (ADR-027): what deleting the site removes, for the
   * card "Xóa site".
   */
  siteDeletionSummary: endpoint({
    method: 'GET',
    path: (siteId: string) => `/sites/${e(siteId)}/deletion-summary`,
    request: null,
    query: null,
    response: siteDeletionSummarySchema,
  }),
  /**
   * `sites.manage` and `personalData.manage` (ADR-027): deletes the site and all of its data, leads
   * included, and frees its subdomain and custom domains. 422 when `confirmName` is not the site's
   * name. No undo.
   */
  deleteSite: endpoint({
    method: 'DELETE',
    path: (siteId: string) => `/sites/${e(siteId)}`,
    request: deleteSiteRequestSchema,
    query: null,
    response: null,
  }),

  // Custom domains (ADR-022): `domains.manage`
  listDomains: endpoint({
    method: 'GET',
    path: (siteId: string) => `/sites/${e(siteId)}/domains`,
    request: null,
    query: null,
    response: domainListResponseSchema,
  }),
  addDomain: endpoint({
    method: 'POST',
    path: (siteId: string) => `/sites/${e(siteId)}/domains`,
    request: addDomainRequestSchema,
    query: null,
    response: domainSchema,
  }),
  /** Board 14 while the domain is typed: whether adding it would work, never whose it is. */
  domainAvailability: endpoint({
    method: 'GET',
    path: (siteId: string) => `/sites/${e(siteId)}/domains/availability`,
    request: null,
    query: domainAvailabilityQuerySchema,
    response: domainAvailabilitySchema,
  }),
  /** "Kiểm tra ngay": checks the DNS (and HTTPS) of the domain now. */
  checkDomain: endpoint({
    method: 'POST',
    path: (siteId: string, domainId: string) => `/sites/${e(siteId)}/domains/${e(domainId)}/check`,
    request: null,
    query: null,
    response: domainSchema,
  }),
  removeDomain: endpoint({
    method: 'DELETE',
    path: (siteId: string, domainId: string) => `/sites/${e(siteId)}/domains/${e(domainId)}`,
    request: null,
    query: null,
    response: null,
  }),
  /** The primary address: an active custom domain, or null for the default one. */
  setPrimaryDomain: endpoint({
    method: 'PUT',
    path: (siteId: string) => `/sites/${e(siteId)}/primary-domain`,
    request: setPrimaryDomainRequestSchema,
    query: null,
    response: domainListResponseSchema,
  }),
  /**
   * `pages.view`: whether the primary address works and whether a custom domain is connected, for
   * the card "Địa chỉ live" and the setup checklist of board 01.
   */
  siteAddressStatus: endpoint({
    method: 'GET',
    path: (siteId: string) => `/sites/${e(siteId)}/address-status`,
    request: null,
    query: null,
    response: siteAddressStatusSchema,
  }),

  // Personal data and consent (ADR-017): every member reads, `privacy.manage` writes (ADR-020)
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

  // Lead inbox (ADR-018): `leads.view` reads, `leads.handle` triages, `leads.export` and
  // `personalData.manage` export and delete (ADR-020)
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
   * `leads.export`. A CSV file (UTF-8 with BOM) of the leads matching the filters, newest first, at
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
    path: (siteId: string, leadId: string) => `/sites/${e(siteId)}/leads/${e(leadId)}`,
    request: null,
    query: null,
    response: leadDetailSchema,
  }),
  /** Status, internal note, or moving to and from "Nghi ngờ spam". */
  updateLead: endpoint({
    method: 'PATCH',
    path: (siteId: string, leadId: string) => `/sites/${e(siteId)}/leads/${e(leadId)}`,
    request: updateLeadRequestSchema,
    query: null,
    response: leadDetailSchema,
  }),
  /**
   * `personalData.manage`: the lead's name, phone number and email, e.g. for a request to correct
   * them.
   */
  updateLeadContact: endpoint({
    method: 'PATCH',
    path: (siteId: string, leadId: string) => `/sites/${e(siteId)}/leads/${e(leadId)}/contact`,
    request: updateLeadContactRequestSchema,
    query: null,
    response: leadDetailSchema,
  }),
  /**
   * `personalData.manage`. A JSON or CSV file with every lead of the same person (phone number or
   * email) in the site, consent evidence included; at most `LEAD_PERSON_EXPORT_MAX` leads.
   */
  exportLeadPerson: endpoint({
    method: 'POST',
    path: (siteId: string, leadId: string) =>
      `/sites/${e(siteId)}/leads/${e(leadId)}/person/export`,
    request: personExportRequestSchema,
    query: null,
    response: null,
  }),
  /**
   * `personalData.manage`. Deletes every lead of the same person in the site. Copies already sent
   * by email are not deleted (ADR-017).
   */
  deleteLeadPerson: endpoint({
    method: 'DELETE',
    path: (siteId: string, leadId: string) => `/sites/${e(siteId)}/leads/${e(leadId)}/person`,
    request: null,
    query: null,
    response: personDeleteResponseSchema,
  }),

  /** `leads.handle`: sends the lead's email notification again after it failed (ADR-018). */
  retryLeadNotification: endpoint({
    method: 'POST',
    path: (siteId: string, leadId: string) =>
      `/sites/${e(siteId)}/leads/${e(leadId)}/notification/retry`,
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
  /** `pages.view`: "Hiệu quả" for a range, of the site or one page. */
  analyticsReport: endpoint({
    method: 'GET',
    path: (siteId: string) => `/sites/${e(siteId)}/analytics`,
    request: null,
    query: analyticsQuerySchema,
    response: analyticsReportSchema,
  }),

  // Requests from people who sent a form (ADR-017): `personalData.manage` (ADR-020)
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
    path: (siteId: string, requestId: string) =>
      `/sites/${e(siteId)}/data-requests/${e(requestId)}`,
    request: null,
    query: null,
    response: dataRequestDetailSchema,
  }),
  /** The person was answered. 409 `conflict` unless the request is `open`. */
  respondDataRequest: endpoint({
    method: 'POST',
    path: (siteId: string, requestId: string) =>
      `/sites/${e(siteId)}/data-requests/${e(requestId)}/respond`,
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
    path: (siteId: string, requestId: string) =>
      `/sites/${e(siteId)}/data-requests/${e(requestId)}/export`,
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
    path: (siteId: string, requestId: string) =>
      `/sites/${e(siteId)}/data-requests/${e(requestId)}/complete`,
    request: null,
    query: null,
    response: dataRequestDetailSchema,
  }),

  // Lead recipients (ADR-018): `leads.view` reads them, `privacy.manage` changes them (ADR-020)
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

  // Templates (ADR-030): every member sees the library; creating a page from one is `createPage`
  listTemplates: endpoint({
    method: 'GET',
    path: (workspaceId: string) => `/workspaces/${e(workspaceId)}/templates`,
    request: null,
    query: null,
    response: templateListResponseSchema,
  }),
  /**
   * One template with its preview and use count; with `siteId`, a site the member may open, also
   * what that site still needs before a page from it can be published.
   */
  getTemplate: endpoint({
    method: 'GET',
    path: (workspaceId: string, templateId: string) =>
      `/workspaces/${e(workspaceId)}/templates/${e(templateId)}`,
    request: null,
    query: templateDetailQuerySchema,
    response: templateDetailSchema,
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
    path: (siteId: string, pageId: string) => `/sites/${e(siteId)}/pages/${e(pageId)}`,
    request: null,
    query: null,
    response: pageDetailResponseSchema,
  }),
  saveDraft: endpoint({
    method: 'PUT',
    path: (siteId: string, pageId: string) => `/sites/${e(siteId)}/pages/${e(pageId)}/draft`,
    request: saveDraftRequestSchema,
    query: null,
    response: saveDraftResponseSchema,
  }),
  restoreDraft: endpoint({
    method: 'POST',
    path: (siteId: string, pageId: string) =>
      `/sites/${e(siteId)}/pages/${e(pageId)}/draft/restore`,
    request: restoreDraftRequestSchema,
    query: null,
    response: pageDetailResponseSchema,
  }),
  /**
   * `pages.manageLive` (ADR-027): deletes a page that is not live, with its versions (except those
   * leads keep as their consent evidence), redirects and requests to publish. Leads, "Hiệu quả" and
   * the activity stay. 409 `page_live` while the page is live.
   */
  deletePage: endpoint({
    method: 'DELETE',
    path: (siteId: string, pageId: string) => `/sites/${e(siteId)}/pages/${e(pageId)}`,
    request: null,
    query: null,
    response: null,
  }),

  // Publishing
  getChecks: endpoint({
    method: 'GET',
    path: (siteId: string, pageId: string) => `/sites/${e(siteId)}/pages/${e(pageId)}/checks`,
    request: null,
    query: null,
    response: checksResultSchema,
  }),
  /** Requires the `Idempotency-Key` header. */
  publish: endpoint({
    method: 'POST',
    path: (siteId: string, pageId: string) => `/sites/${e(siteId)}/pages/${e(pageId)}/releases`,
    request: publishRequestSchema,
    query: null,
    response: publishResponseSchema,
  }),
  history: endpoint({
    method: 'GET',
    path: (siteId: string, pageId: string) => `/sites/${e(siteId)}/pages/${e(pageId)}/history`,
    request: null,
    query: cursorQuerySchema,
    response: historyResponseSchema,
  }),
  /** A request to publish, its withdrawal by the sender and its refusal (ADR-023). */
  requestApproval: endpoint({
    method: 'POST',
    path: (siteId: string, pageId: string) => `/sites/${e(siteId)}/pages/${e(pageId)}/approval`,
    request: requestApprovalSchema,
    query: null,
    response: approvalResponseSchema,
  }),
  withdrawApproval: endpoint({
    method: 'DELETE',
    path: (siteId: string, pageId: string) => `/sites/${e(siteId)}/pages/${e(pageId)}/approval`,
    request: null,
    query: null,
    response: approvalResponseSchema,
  }),
  rejectApproval: endpoint({
    method: 'POST',
    path: (siteId: string, pageId: string) =>
      `/sites/${e(siteId)}/pages/${e(pageId)}/approval/reject`,
    request: rejectApprovalSchema,
    query: null,
    response: approvalResponseSchema,
  }),
  /** Rollback (target = older release) or unpublish (target = null). */
  movePointer: endpoint({
    method: 'POST',
    path: (siteId: string, pageId: string) => `/sites/${e(siteId)}/pages/${e(pageId)}/pointer`,
    request: pointerMoveRequestSchema,
    query: null,
    response: pointerMoveResponseSchema,
  }),
  undoActivity: endpoint({
    method: 'POST',
    path: (siteId: string, activityId: string) =>
      `/sites/${e(siteId)}/activity/${e(activityId)}/undo`,
    request: null,
    query: null,
    response: pointerMoveResponseSchema,
  }),
  createPreviewLink: endpoint({
    method: 'POST',
    path: (siteId: string, pageId: string) =>
      `/sites/${e(siteId)}/pages/${e(pageId)}/preview-links`,
    request: createPreviewLinkRequestSchema,
    query: null,
    response: previewLinkResponseSchema,
  }),

  // AI (ADR-031): `pages.edit` on the site
  /** The workspace's uses this month, and whether the API has an AI service at all. */
  aiUsage: endpoint({
    method: 'GET',
    path: (siteId: string) => `/sites/${e(siteId)}/ai/usage`,
    request: null,
    query: null,
    response: aiUsageSchema,
  }),
  /**
   * "Viết nội dung": reserves one use and starts a job that writes the sections and creates the
   * draft. 200 with an NDJSON stream (`AI_JOB_STREAM_TYPE`), one `aiJobEventSchema` per line, until
   * the job ends; the job still ends when the client goes away. Refused before the stream starts:
   * 409 `ai_disabled`, 429 `ai_quota_exhausted` or `rate_limited`, 409 `slug_taken`.
   */
  startAiPageJob: endpoint({
    method: 'POST',
    path: (siteId: string) => `/sites/${e(siteId)}/ai/page-jobs`,
    request: aiPageJobRequestSchema,
    query: null,
    response: null,
  }),
  /** A job as it stands; a job past its deadline is ended and its use given back first. */
  getAiPageJob: endpoint({
    method: 'GET',
    path: (siteId: string, jobId: string) => `/sites/${e(siteId)}/ai/page-jobs/${e(jobId)}`,
    request: null,
    query: null,
    response: aiJobSchema,
  }),
  /**
   * "Thử lại N section": writes the failed sections of a finished job into its draft, without
   * another use, at most `AI_RETRIES_PER_JOB` times. The same NDJSON stream as `startAiPageJob`.
   */
  retryAiPageJob: endpoint({
    method: 'POST',
    path: (siteId: string, jobId: string) => `/sites/${e(siteId)}/ai/page-jobs/${e(jobId)}/retry`,
    request: null,
    query: null,
    response: null,
  }),
  /** "Hủy": stops a running job; a first run writes no draft and gives its use back. */
  cancelAiPageJob: endpoint({
    method: 'POST',
    path: (siteId: string, jobId: string) => `/sites/${e(siteId)}/ai/page-jobs/${e(jobId)}/cancel`,
    request: null,
    query: null,
    response: aiJobSchema,
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
    path: (siteId: string, assetId: string) => `/sites/${e(siteId)}/assets/${e(assetId)}`,
    request: updateAssetRequestSchema,
    query: null,
    response: assetSchema,
  }),

  // Public delivery (renderer only; no session)
  /** The site a custom domain serves; 404 unless verified and pointing here (ADR-022). */
  publicHostSite: endpoint({
    method: 'GET',
    path: (host: string) => `/public/hosts/${e(host)}`,
    request: null,
    query: null,
    response: hostSiteResponseSchema,
  }),
  publicSiteAddress: endpoint({
    method: 'GET',
    path: (subdomain: string) => `/public/sites/${e(subdomain)}/address`,
    request: null,
    query: null,
    response: siteAddressResponseSchema,
  }),
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
  /** 200 when the token opens a page or release of its site, 404 otherwise; no page data. */
  publicPreviewStatus: endpoint({
    method: 'GET',
    path: (token: string) => `/public/preview/${e(token)}/status`,
    request: null,
    query: null,
    response: publicPreviewStatusResponseSchema,
  }),
} as const;

export type Endpoints = typeof endpoints;
