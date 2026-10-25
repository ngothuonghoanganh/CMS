import { randomBytes } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import {
  confirmLeadRecipientResponseSchema,
  consentVersionSchema,
  type CreatePageRequest,
  endpoints,
  leadRecipientSchema,
  type MeResponse,
  meResponseSchema,
  type PageDetailResponse,
  pageDetailResponseSchema,
  privacySettingsSchema,
  type Site,
  siteSchema,
  SUGGESTED_MARKETING_CONSENT_TEXT,
  SUGGESTED_REQUIRED_CONSENT_TEXT,
} from '@plp/contracts';
import { urls } from '../urls.js';
import { confirmationLink, waitForEmail } from './mailpit.js';

export const PASSWORD = 'MatKhau-e2e-an-toan-2026';

/** Short, unique per call and per run: lowercase letters and digits only. */
export function uniqueId(): string {
  return `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
}

export interface Account {
  name: string;
  email: string;
  password: string;
  workspaceName: string;
}

export function newAccount(name = 'Ngọc Anh', workspaceName = 'Mây Xanh Agency'): Account {
  return { name, email: `e2e-${uniqueId()}@example.com`, password: PASSWORD, workspaceName };
}

/** A subdomain no other run uses (format: 3–40 lowercase letters and digits). */
export function newSubdomain(prefix = 'e2e'): string {
  return `${prefix}${uniqueId()}`;
}

/**
 * Calls the API through the admin's `/api` proxy, as the browser does, so the session cookie lands
 * in the same cookie jar as the page that owns `request` (`page.request`). State-changing requests
 * carry the admin `Origin`, which the API requires.
 */
async function call<T>(
  request: APIRequestContext,
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  schema: { parse: (value: unknown) => T },
  data?: unknown,
): Promise<T> {
  const url = `${urls.admin}/api${path}`;
  const response =
    method === 'GET'
      ? await request.get(url)
      : await request.fetch(url, { method, data, headers: { origin: urls.admin } });
  if (!response.ok()) {
    throw new Error(`${method} ${path} answered ${response.status()}: ${await response.text()}`);
  }
  return schema.parse(await response.json());
}

export function signUpViaApi(request: APIRequestContext, account: Account): Promise<MeResponse> {
  return call(request, 'POST', endpoints.signup.path(), meResponseSchema, account);
}

export function createSiteViaApi(
  request: APIRequestContext,
  workspaceId: string,
  site: { name: string; subdomain: string },
): Promise<Site> {
  return call(request, 'POST', endpoints.createSite.path(workspaceId), siteSchema, site);
}

export function createPageViaApi(
  request: APIRequestContext,
  siteId: string,
  body: CreatePageRequest,
): Promise<PageDetailResponse> {
  return call(request, 'POST', endpoints.createPage.path(siteId), pageDetailResponseSchema, body);
}

export const PRIVACY = {
  controllerName: 'Công ty TNHH Nha khoa Smile Care',
  requestEmail: 'dulieu@smilecare.vn',
  policyUrl: 'https://smilecare.vn/chinh-sach-quyen-rieng-tu',
  retentionMonths: 12,
} as const;

/**
 * The site's personal data settings and a first consent version (ADR-017), as the owner saves
 * them on "Dữ liệu & đồng ý". A page with a lead form cannot be published without them (ADR-016).
 */
export async function configurePrivacyViaApi(
  request: APIRequestContext,
  siteId: string,
): Promise<void> {
  await call(
    request,
    'PUT',
    endpoints.updatePrivacySettings.path(siteId),
    privacySettingsSchema,
    PRIVACY,
  );
  await call(request, 'POST', endpoints.createConsentVersion.path(siteId), consentVersionSchema, {
    baseVersion: 0,
    requiredText: SUGGESTED_REQUIRED_CONSENT_TEXT,
    marketingText: SUGGESTED_MARKETING_CONSENT_TEXT,
  });
}

/** An address no other run uses, so its emails in Mailpit are this site's only. */
export function newRecipientEmail(): string {
  return `lead-${uniqueId()}@example.com`;
}

/**
 * Adds an address to "Nơi nhận lead" as the owner and confirms it through the link Mailpit
 * received, as its owner would (ADR-018).
 */
export async function confirmRecipientViaApi(
  request: APIRequestContext,
  siteId: string,
  email = newRecipientEmail(),
): Promise<string> {
  await call(request, 'POST', endpoints.addLeadRecipient.path(siteId), leadRecipientSchema, {
    email,
  });
  const link = confirmationLink(await waitForEmail(request, email, 'Xác nhận nhận lead'));
  const token = new URL(link).hash.replace('#token=', '');
  await call(
    request,
    'POST',
    endpoints.confirmLeadRecipient.path(),
    confirmLeadRecipientResponseSchema,
    { token },
  );
  return email;
}

/**
 * What a page with a form needs before it can be published: the personal data settings with a
 * consent version (ADR-017), and a confirmed address its leads go to (ADR-018).
 */
export async function setUpLeadCaptureViaApi(
  request: APIRequestContext,
  siteId: string,
): Promise<string> {
  await configurePrivacyViaApi(request, siteId);
  return confirmRecipientViaApi(request, siteId);
}

export interface SiteFixture {
  account: Account;
  site: Site;
}

/** Signs a new owner up and creates their site; `request` keeps the session afterwards. */
export async function setUpSite(
  request: APIRequestContext,
  siteName = 'Nha khoa Smile Care',
): Promise<SiteFixture> {
  const account = newAccount();
  const me = await signUpViaApi(request, account);
  const workspace = me.memberships[0]?.workspace;
  if (workspace === undefined) {
    throw new Error(`Sign-up of ${account.email} returned no workspace`);
  }
  const site = await createSiteViaApi(request, workspace.id, {
    name: siteName,
    subdomain: newSubdomain(),
  });
  return { account, site };
}

/** The promotion page most specs work on: Hero heading from the brief, phone CTA, sample text. */
export function promoPage(slug: string, offer: string): CreatePageRequest {
  return {
    title: 'Ưu đãi niềng răng tháng 11',
    slug,
    start: {
      kind: 'goal',
      goal: 'promo',
      brief: { offer, audience: 'Người đi làm 25–40 tuổi', phone: '0901 234 567' },
      style: 'calm',
    },
  };
}
