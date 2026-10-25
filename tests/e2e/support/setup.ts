import { randomBytes } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import {
  type CreatePageRequest,
  endpoints,
  type MeResponse,
  meResponseSchema,
  type PageDetailResponse,
  pageDetailResponseSchema,
  type Site,
  siteSchema,
} from '@plp/contracts';
import { urls } from '../urls.js';

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
  method: 'GET' | 'POST',
  path: string,
  schema: { parse: (value: unknown) => T },
  data?: unknown,
): Promise<T> {
  const url = `${urls.admin}/api${path}`;
  const response =
    method === 'GET'
      ? await request.get(url)
      : await request.post(url, { data, headers: { origin: urls.admin } });
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
