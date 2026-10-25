import { DIRECT_LEAD_SOURCE, type LeadSource } from '@plp/contracts';

export interface LeadSourceInput {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referrer: string | null;
  /** Host of the site itself: navigating between its pages is not a referral. */
  siteHost: string;
}

const VALUE_MAX = 40;

/** Search engines by the second-level name of their host, e.g. "google" in "www.google.com.vn". */
const SEARCH_ENGINES = ['google', 'bing', 'coccoc', 'yahoo', 'duckduckgo', 'yandex'] as const;

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** The longest run of `parts` from the start that fits in `VALUE_MAX` UTF-16 units. */
function fitted(parts: Iterable<string>): string {
  let cut = '';
  for (const part of parts) {
    if (cut.length + part.length > VALUE_MAX) {
      break;
    }
    cut += part;
  }
  return cut;
}

/**
 * At most `VALUE_MAX` UTF-16 units, cut between characters as people see them: a flag, an emoji
 * joined by ZWJ or a letter with its accents is kept whole or left out.
 */
function cutToMax(text: string): string {
  if (text.length <= VALUE_MAX) {
    return text;
  }
  const whole = fitted(Array.from(graphemes.segment(text), (item) => item.segment));
  // One character longer than the limit (a letter under a run of combining marks): cut between
  // its code points instead.
  return whole === '' ? fitted(text) : whole;
}

/**
 * Lowercase, trimmed, at most 40 characters; null when empty. A run of spaces or control
 * characters (a line break in a campaign tag) becomes one space, and a cut never splits a
 * character in two.
 */
function clean(value: string | null): string | null {
  const text = cutToMax(
    value
      ?.replace(/[\s\p{Cc}]+/gu, ' ')
      .trim()
      .toLowerCase() ?? '',
  ).trim();
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
 * Direct visits and each search engine's organic visits: a handful of pairs that nobody can
 * multiply, so the daily cap of source pairs never folds them into "khác" (ADR-019).
 */
export function isStandardSource(pair: { source: string; medium: string }): boolean {
  if (pair.source === DIRECT_LEAD_SOURCE.source) {
    return pair.medium === DIRECT_LEAD_SOURCE.medium;
  }
  return pair.medium === 'organic' && SEARCH_ENGINES.some((name) => name === pair.source);
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
      medium: clean(input.utmMedium) ?? DIRECT_LEAD_SOURCE.medium,
      campaign: clean(input.utmCampaign),
    };
  }
  const host = referrerHost(input.referrer);
  if (host === null || host === bareHost(input.siteHost.split(':')[0] ?? '')) {
    return { ...DIRECT_LEAD_SOURCE, campaign: null };
  }
  const engine = searchEngine(host);
  return engine === null
    ? { source: host.slice(0, VALUE_MAX), medium: 'referral', campaign: null }
    : { source: engine, medium: 'organic', campaign: null };
}
