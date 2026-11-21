import { createHash } from 'node:crypto';
import type { Composition } from '@plp/contracts';

/**
 * JSON with every object's keys sorted as `<` orders strings (UTF-16 code units, the same as code
 * points for a composition's keys, which are ASCII) and no whitespace, so that the same value
 * always gives the same text whatever order its keys were written or parsed in. Arrays keep their
 * order: the order of sections is content. Keys whose value is `undefined` are left out, as
 * `JSON.stringify` leaves them out.
 */
export function canonicalJson(value: unknown): string {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    throw new Error(`${typeof value} has no JSON form`);
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry: unknown) => (entry === undefined ? 'null' : canonicalJson(entry))).join(',')}]`;
  }
  const entries = Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
}

/**
 * A licence's `versionHash` (ADR-036): SHA-256, in hex, of the version's composition as the
 * registry parsed it, in canonical JSON. A version of the catalog never changes once released, so
 * the API refuses to start when a licence's hash no longer matches the file.
 */
export function versionHashOf(composition: Composition): string {
  return createHash('sha256').update(canonicalJson(composition), 'utf8').digest('hex');
}
