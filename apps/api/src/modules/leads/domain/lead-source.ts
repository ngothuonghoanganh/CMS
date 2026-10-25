/** Where a lead came from, as "source / medium" (ADR-016). */
export interface LeadSource {
  source: string;
  medium: string;
  campaign: string | null;
}

export interface LeadSourceInput {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referrer: string | null;
  /** Host of the site itself: navigating between its pages is not a referral. */
  siteHost: string;
}

/** No campaign tags and no outside referrer; shown as "trực tiếp". */
export const DIRECT_SOURCE = { source: '(direct)', medium: '(none)' } as const;

const VALUE_MAX = 40;

/** Search engines by the second-level name of their host, e.g. "google" in "www.google.com.vn". */
const SEARCH_ENGINES = ['google', 'bing', 'coccoc', 'yahoo', 'duckduckgo', 'yandex'] as const;

/** Lowercase, trimmed, at most 40 characters; null when empty. */
function clean(value: string | null): string | null {
  const text = value?.trim().toLowerCase().slice(0, VALUE_MAX).trim() ?? '';
  return text === '' ? null : text;
}

/** "m.facebook.com", "l.facebook.com" and "www.facebook.com" are all "facebook.com". */
function bareHost(host: string): string {
  return host.toLowerCase().replace(/^(?:www|m|l|lm|mobile)\./, '');
}

function referrerHost(referrer: string | null): string | null {
  if (referrer === null || !URL.canParse(referrer)) {
    return null;
  }
  const url = new URL(referrer);
  return url.protocol === 'http:' || url.protocol === 'https:' ? bareHost(url.hostname) : null;
}

function searchEngine(host: string): string | null {
  const labels = host.split('.');
  return SEARCH_ENGINES.find((name) => labels.includes(name)) ?? null;
}

/**
 * Campaign tags win; otherwise a search engine is "{name} / organic", another site
 * "{domain} / referral", and nothing (or the site itself) is direct.
 */
export function normalizeLeadSource(input: LeadSourceInput): LeadSource {
  const utmSource = clean(input.utmSource);
  if (utmSource !== null) {
    return {
      source: utmSource,
      medium: clean(input.utmMedium) ?? DIRECT_SOURCE.medium,
      campaign: clean(input.utmCampaign),
    };
  }
  const host = referrerHost(input.referrer);
  if (host === null || host === bareHost(input.siteHost.split(':')[0] ?? '')) {
    return { ...DIRECT_SOURCE, campaign: null };
  }
  const engine = searchEngine(host);
  return engine === null
    ? { source: host.slice(0, VALUE_MAX), medium: 'referral', campaign: null }
    : { source: engine, medium: 'organic', campaign: null };
}
