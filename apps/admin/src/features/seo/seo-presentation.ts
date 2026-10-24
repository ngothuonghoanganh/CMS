import {
  type Composition,
  type PageSummary,
  SEO_DESCRIPTION_RECOMMENDED_MAX,
  SEO_TITLE_RECOMMENDED_MAX,
} from '@plp/contracts';

/** Display rules of "SEO & chia sẻ" (board 07). Pure functions, unit-tested. */

/** Search engines cut longer titles; the preview shows 58 characters and "…" (board). */
export const SEARCH_TITLE_VISIBLE = 58;
export const SEARCH_DESCRIPTION_VISIBLE = 157;
/** Same bound as `slugSchema`. */
export const SLUG_MAX = 80;

export interface FieldHint {
  tone: 'help' | 'warning';
  text: string;
}

/** The hint under "Tiêu đề trên công cụ tìm kiếm". */
export function seoTitleHint(title: string): FieldHint {
  const length = title.trim().length;
  if (length === 0) {
    return { tone: 'help', text: 'Đang để trống: sẽ dùng tiêu đề Hero.' };
  }
  if (length > SEO_TITLE_RECOMMENDED_MAX) {
    return { tone: 'warning', text: 'Hơi dài: phần cuối có thể bị cắt trên kết quả tìm kiếm.' };
  }
  return { tone: 'help', text: 'Độ dài phù hợp.' };
}

function cut(text: string, limit: number, visible: number): string {
  return text.length > limit ? `${text.slice(0, visible)}…` : text;
}

/** The title as a search result shows it: over 60 characters, 58 and "…". */
export function searchResultTitle(title: string): string {
  return cut(title, SEO_TITLE_RECOMMENDED_MAX, SEARCH_TITLE_VISIBLE);
}

/** The description as a search result shows it: over 160 characters, 157 and "…". */
export function searchResultDescription(description: string): string {
  return cut(description, SEO_DESCRIPTION_RECOMMENDED_MAX, SEARCH_DESCRIPTION_VISIBLE);
}

/** The heading of the page's first Hero, which stands in for an empty SEO title (ADR-005). */
export function heroHeadingOf(composition: Composition): string {
  const hero = composition.sections.find((section) => section.type === 'hero');
  const heading = hero?.content.heading;
  return typeof heading === 'string' ? heading.trim() : '';
}

/** The title the live page will use: the SEO title, else the Hero heading, else the page name. */
export function effectiveTitle(seoTitle: string, composition: Composition, pageTitle: string) {
  const own = seoTitle.trim();
  if (own !== '') {
    return own;
  }
  const hero = heroHeadingOf(composition);
  return hero === '' ? pageTitle : hero;
}

/**
 * Normalizes a slug while it is typed: no accents, lowercase, anything else becomes "-", no
 * leading or doubled "-". A trailing "-" stays, since the next word may follow.
 */
export function normalizeSlugTyping(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, SLUG_MAX);
}

/** The slug once typing ends: a trailing "-" is dropped. */
export function finalizeSlug(input: string): string {
  return normalizeSlugTyping(input).replace(/-+$/, '');
}

/** A slug still being typed ("uu-dai-") is not checked yet. */
export function isSlugComplete(text: string): boolean {
  return !text.endsWith('-');
}

/**
 * The live slug that will redirect to the new one when the draft is published, or null when the
 * page is not live or keeps its slug (ADR-011).
 */
export function redirectedLiveSlug(page: Pick<PageSummary, 'liveRelease'>, slug: string) {
  const live = page.liveRelease;
  return live !== null && live.slug !== slug ? live.slug : null;
}

/** "smilecare.payload.site › uu-dai-thang-11" (the host alone for the home page). */
export function searchResultPath(host: string, slug: string): string {
  return slug === '' ? host : `${host} › ${slug}`;
}

/** First letter of the site name for the search result's site icon. */
export function siteInitial(name: string): string {
  const first = Array.from(name.trim())[0];
  return first === undefined ? '?' : first.toLocaleUpperCase('vi');
}
