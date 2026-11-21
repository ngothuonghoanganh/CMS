import type { Composition } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { testMarketplaceCatalog, TWO_VERSIONS_ITEM_ID } from '../../../../test/marketplace.js';
import { BUNDLED_MARKETPLACE_CATALOG_FILE } from '../../../config/env.js';
import { loadMarketplaceCatalog } from '../marketplace-catalog.js';
import { canonicalJson, versionHashOf } from './version-hash.js';

/** Every own key of every object in reverse order: the same value written another way. */
function reversedKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(reversedKeys);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, entry]) => [key, reversedKeys(entry)]),
    );
  }
  return value;
}

function compositionOf(itemId: string, version: number): Composition {
  const composition = testMarketplaceCatalog()
    .items.find((item) => item.id === itemId)
    ?.versions.find((candidate) => candidate.version === version)?.composition;
  if (composition === undefined) {
    throw new Error(`No ${itemId} v${version}`);
  }
  return composition;
}

describe('canonical JSON', () => {
  it('sorts the keys of every object and keeps the order of arrays', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: true, y: null }], c: 'x' } })).toBe(
      '{"a":{"c":"x","d":[3,{"y":null,"z":true}]},"b":1}',
    );
    expect(canonicalJson([2, 1])).not.toBe(canonicalJson([1, 2]));
  });

  it('writes strings and keys as JSON does, and leaves out what JSON leaves out', () => {
    expect(canonicalJson({ 'Tiêu đề': 'Ưu đãi “mới”\n', bỏ: undefined })).toBe(
      '{"Tiêu đề":"Ưu đãi “mới”\\n"}',
    );
    expect(canonicalJson([undefined])).toBe('[null]');
    expect(() => canonicalJson(undefined)).toThrow(/no JSON form/);
  });
});

describe('the hash of a version (ADR-036)', () => {
  const composition = compositionOf('mp-khai-truong-phong-tap', 1);

  it('is SHA-256 in hex, the same for the same content written in any key order', () => {
    const hash = versionHashOf(composition);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(versionHashOf(reversedKeys(composition) as Composition)).toBe(hash);
    expect(versionHashOf(structuredClone(composition))).toBe(hash);
  });

  it('changes with the content: another heading, or sections in another order', () => {
    const hash = versionHashOf(composition);
    expect(versionHashOf(compositionOf(TWO_VERSIONS_ITEM_ID, 2))).not.toBe(hash);
    expect(versionHashOf(compositionOf(TWO_VERSIONS_ITEM_ID, 1))).toBe(hash);
    expect(
      versionHashOf({ ...composition, sections: [...composition.sections].reverse() }),
    ).not.toBe(hash);
  });

  it('stays what it was for the bundled catalog: a licence granted today still matches', () => {
    // A change here means a released version's content, or the hash itself, changed: licences
    // granted before would stop the API. These are also what Python's `json.dumps(composition,
    // sort_keys=True, separators=(',', ':'), ensure_ascii=False)` hashes to.
    const hashes = Object.fromEntries(
      loadMarketplaceCatalog(BUNDLED_MARKETPLACE_CATALOG_FILE).items.map((item) => [
        item.id,
        item.versions.map((version) => versionHashOf(version.composition)),
      ]),
    );
    expect(hashes).toEqual({
      'mp-khai-truong-phong-tap': [
        '122e0a84748e598c91ba9c83c45d5e087f42ad45b81a7d14f222ef87badbe6b2',
      ],
      'mp-mo-ban-du-an-can-ho': [
        '0ea0b4b62c7c5bd36eb1012939f8e701170b113c4cf5bc81e35574ebab7f9d40',
      ],
      'mp-spa-uu-dai-ngay-le': ['4890832087aa0ba4e17550fd041b299475053abc93797db4aabf02b27efca8c1'],
      'mp-khoa-hoc-tieng-anh-tre-em': [
        '1c628d287fb9714075a135a4266111b2a1c322a8abbdcc65ade76a3baf361819',
      ],
    });
  });
});
