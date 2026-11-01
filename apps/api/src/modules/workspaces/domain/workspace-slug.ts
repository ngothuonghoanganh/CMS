/** Host names the admin keeps for itself: never a workspace's address (ADR-025). */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'app',
  'assets',
  'cdn',
  'docs',
  'help',
  'mail',
  'static',
  'status',
  'www',
]);

const MAX_LENGTH = 40;
const MIN_LENGTH = 3;

/**
 * The address a workspace name asks for: no diacritics ("đ" as "d"), lower case, every other
 * character a dash, at most 40 characters; too short gets "-ws".
 */
export function slugBaseOf(name: string): string {
  const plain = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const cut = plain.slice(0, MAX_LENGTH).replace(/-+$/, '');
  if (cut.length >= MIN_LENGTH) {
    return cut;
  }
  return cut === '' ? 'workspace' : `${cut}-ws`;
}

/**
 * The first free address from `base`: itself, then `base-2`, `base-3`, … cut to fit 40
 * characters. `taken` holds the addresses already used that start with `base`.
 */
export function freeSlug(base: string, taken: ReadonlySet<string>): string {
  const free = (slug: string) => !taken.has(slug) && !RESERVED_SLUGS.has(slug);
  if (free(base)) {
    return base;
  }
  for (let n = 2; ; n += 1) {
    const suffix = `-${n.toString()}`;
    const slug = `${base.slice(0, MAX_LENGTH - suffix.length).replace(/-+$/, '')}${suffix}`;
    if (free(slug)) {
      return slug;
    }
  }
}
