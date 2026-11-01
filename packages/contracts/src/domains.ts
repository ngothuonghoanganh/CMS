import { z } from 'zod';
import { idSchema, isoDateTimeSchema, userRefSchema } from './common.js';

/*
 * Custom domains of a site (boards 08, 13, 14; ADR-022).
 */

/** Custom domains a site may have, besides its default address. */
export const CUSTOM_DOMAINS_MAX = 5;

/** Name of the TXT record that proves ownership, under the domain: `_payload.go.example.vn`. */
export const VERIFICATION_RECORD_LABEL = '_payload';

/** Value of that TXT record: `payload-verify=<token>`. */
export const VERIFICATION_VALUE_PREFIX = 'payload-verify=';

export const HOSTNAME_MAX = 253;

/** Second-level suffixes under which a name of three labels is itself a registrable domain. */
const SECOND_LEVEL_SUFFIXES = new Set([
  'com.vn',
  'net.vn',
  'org.vn',
  'edu.vn',
  'gov.vn',
  'biz.vn',
  'info.vn',
  'name.vn',
  'pro.vn',
  'health.vn',
  'int.vn',
  'ac.vn',
  'co.uk',
  'org.uk',
  'com.au',
  'com.sg',
  'com.my',
]);

/**
 * Whether the name is a registrable domain (needs A records) or a name under one (a CNAME). Only
 * guides which record to show: the check accepts either (ADR-022).
 */
export function domainKind(hostname: string): 'apex' | 'subdomain' {
  const labels = hostname.split('.');
  if (labels.length <= 2) {
    return 'apex';
  }
  return labels.length === 3 && SECOND_LEVEL_SUFFIXES.has(labels.slice(1).join('.'))
    ? 'apex'
    : 'subdomain';
}

/** The registrable domain a name is under, e.g. "smilecare.vn" for "go.smilecare.vn". */
export function apexOf(hostname: string): string {
  if (domainKind(hostname) === 'apex') {
    return hostname;
  }
  const labels = hostname.split('.');
  const lastTwo = labels.slice(-2).join('.');
  return SECOND_LEVEL_SUFFIXES.has(lastTwo) ? labels.slice(-3).join('.') : lastTwo;
}

/** A record name as the DNS screens of providers ask for it: "@", "go", "_payload.go". */
export function relativeRecordName(name: string, hostname: string): string {
  const apex = apexOf(hostname);
  if (name === apex) {
    return '@';
  }
  return name.endsWith(`.${apex}`) ? name.slice(0, -apex.length - 1) : name;
}

export type HostnameCheck =
  { ok: true; hostname: string } | { ok: false; message: string; suggestion: string | null };

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * A domain as typed, made canonical: lower case, IDN as punycode, no port, no trailing dot. A URL
 * ("https://go.smilecare.vn/") is refused with the domain as a suggestion, as on board 14.
 */
export function normalizeHostname(input: string, baseDomain?: string): HostnameCheck {
  const typed = input.trim();
  if (typed === '') {
    return { ok: false, message: 'Nhập tên miền', suggestion: null };
  }
  const looksLikeUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(typed) || /[/?#]/.test(typed);
  let host: string;
  try {
    host = new URL(looksLikeUrl && typed.includes('://') ? typed : `http://${typed}`).hostname;
  } catch {
    return { ok: false, message: 'Tên miền không hợp lệ', suggestion: null };
  }
  host = host.replace(/\.$/, '').toLowerCase();
  if (looksLikeUrl || /:\d+$/.test(typed)) {
    return {
      ok: false,
      message: 'Chỉ nhập tên miền, không kèm https://, cổng và dấu / ở cuối.',
      suggestion: host === '' ? null : host,
    };
  }
  const labels = host.split('.');
  if (
    host.length > HOSTNAME_MAX ||
    labels.length < 2 ||
    !labels.every((label) => LABEL.test(label)) ||
    IPV4.test(host) ||
    host.endsWith('.localhost') ||
    /^\d+$/.test(labels.at(-1) ?? '')
  ) {
    return { ok: false, message: 'Tên miền không hợp lệ', suggestion: null };
  }
  const base = baseDomain?.split(':')[0]?.toLowerCase();
  if (base !== undefined && base !== '' && (host === base || host.endsWith(`.${base}`))) {
    return {
      ok: false,
      message: 'Đây là địa chỉ của hệ thống, không phải tên miền riêng',
      suggestion: null,
    };
  }
  return { ok: true, hostname: host };
}

export const domainStatusSchema = z.enum([
  'taken',
  'pending_dns',
  'misconfigured',
  'issuing',
  'active',
  'lost',
  'needs_attention',
]);
export type DomainStatus = z.infer<typeof domainStatusSchema>;

/** The legend of board 13. */
export const domainStatusLabels: Record<DomainStatus, string> = {
  taken: 'Đang thuộc site khác',
  pending_dns: 'Chờ DNS',
  misconfigured: 'Cấu hình sai',
  issuing: 'Đang cấp chứng chỉ',
  active: 'Hoạt động',
  lost: 'Mất kết nối',
  needs_attention: 'Cần can thiệp',
};

export const recordStateSchema = z.enum(['missing', 'ok', 'wrong']);
export type RecordState = z.infer<typeof recordStateSchema>;

/** A DNS record the customer adds at their provider, and what the last check saw of it. */
export const domainRecordSchema = z.object({
  type: z.enum(['CNAME', 'A', 'TXT']),
  /** Full name, e.g. "_payload.go.smilecare.vn". */
  name: z.string(),
  value: z.string(),
  state: recordStateSchema,
});
export type DomainRecord = z.infer<typeof domainRecordSchema>;

export const domainSchema = z.object({
  id: idSchema,
  hostname: z.string(),
  kind: z.enum(['apex', 'subdomain']),
  status: domainStatusSchema,
  primary: z.boolean(),
  /** The records to add: CNAME or A, and the TXT that proves ownership. */
  records: z.array(domainRecordSchema),
  /** What the last check found at the domain itself, for "Đang có" (board 14). */
  found: z.array(z.object({ type: z.enum(['CNAME', 'A']), value: z.string() })),
  checkedAt: isoDateTimeSchema.nullable(),
  /** When the domain may be checked again by itself; null once automatic checks stopped. */
  nextCheckAt: isoDateTimeSchema.nullable(),
  activeSince: isoDateTimeSchema.nullable(),
  lostSince: isoDateTimeSchema.nullable(),
  httpsValidUntil: isoDateTimeSchema.nullable(),
  addedBy: userRefSchema,
  createdAt: isoDateTimeSchema,
});
export type Domain = z.infer<typeof domainSchema>;

export const domainListResponseSchema = z.object({
  items: z.array(domainSchema),
  /** The site's default address, e.g. "smilecare.payload.site". */
  defaultHost: z.string(),
  /** Null: the default address is the primary one. */
  primaryDomainId: idSchema.nullable(),
});
export type DomainListResponse = z.infer<typeof domainListResponseSchema>;

export const addDomainRequestSchema = z.object({ hostname: z.string().max(HOSTNAME_MAX + 20) });
export type AddDomainRequest = z.infer<typeof addDomainRequestSchema>;

export const setPrimaryDomainRequestSchema = z.object({ domainId: idSchema.nullable() });
export type SetPrimaryDomainRequest = z.infer<typeof setPrimaryDomainRequestSchema>;

/** Renderer: the site a custom domain serves. */
export const hostSiteResponseSchema = z.object({ subdomain: z.string() });
export type HostSiteResponse = z.infer<typeof hostSiteResponseSchema>;

/** Renderer: the primary address other hosts of the site redirect to; null when none is active. */
export const siteAddressResponseSchema = z.object({ primaryHost: z.string().nullable() });
export type SiteAddressResponse = z.infer<typeof siteAddressResponseSchema>;
