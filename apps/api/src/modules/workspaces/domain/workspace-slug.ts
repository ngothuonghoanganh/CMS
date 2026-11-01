import { RESERVED_WORKSPACE_SLUGS } from '@plp/contracts';

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

/** The `n`-th form of `base`: itself, then `base-2`, `base-3`, … cut to fit 40 characters. */
function numbered(base: string, n: number): string {
  if (n === 1) {
    return base;
  }
  const suffix = `-${n.toString()}`;
  return `${base.slice(0, MAX_LENGTH - suffix.length).replace(/-+$/, '')}${suffix}`;
}

/**
 * The forms `from` to `from + count - 1` of `base`, reserved names left out: the addresses to ask
 * the database about, a few at a time, so a common base never loads every workspace that has it.
 */
export function slugCandidates(base: string, from: number, count: number): string[] {
  return Array.from({ length: count }, (_, index) => numbered(base, from + index)).filter(
    (slug) => !RESERVED_WORKSPACE_SLUGS.has(slug),
  );
}
