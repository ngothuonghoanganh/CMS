import type { MarketplaceCatalog } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import {
  DRAFT_ITEM_ID,
  testMarketplaceCatalog,
  TWO_VERSIONS_ITEM_ID,
  WITHDRAWN_ITEM_ID,
} from '../../../../test/marketplace.js';
import { type LicenceVersionGroup, licenceProblems } from './licence-check.js';
import { versionHashOf } from './version-hash.js';

const catalog: MarketplaceCatalog = testMarketplaceCatalog();

/** The groups of licences granted at `version` of `itemId`, with its hash in the catalog. */
function grantedAt(itemId: string, version: number, licences = 1): LicenceVersionGroup {
  const composition = catalog.items
    .find((item) => item.id === itemId)
    ?.versions.find((candidate) => candidate.version === version)?.composition;
  if (composition === undefined) {
    throw new Error(`No ${itemId} v${version}`);
  }
  return { itemId, version, versionHash: versionHashOf(composition), licences };
}

describe('the licences against the catalog at startup (ADR-036)', () => {
  it('finds nothing when every licence names a version of the catalog as it was granted', () => {
    expect(licenceProblems(catalog, [])).toEqual([]);
    expect(
      licenceProblems(catalog, [
        grantedAt('mp-khai-truong-phong-tap', 1, 12),
        grantedAt(TWO_VERSIONS_ITEM_ID, 1, 2),
        grantedAt(TWO_VERSIONS_ITEM_ID, 2, 5),
        // Withdrawn: its holders keep using and updating it.
        grantedAt(WITHDRAWN_ITEM_ID, 1),
      ]),
    ).toEqual([]);
  });

  it('names an item the catalog lost, a draft, a lost version and changed content', () => {
    const withoutGym = {
      ...catalog,
      items: catalog.items.filter((item) => item.id !== 'mp-khai-truong-phong-tap'),
    };
    const twoVersions = grantedAt(TWO_VERSIONS_ITEM_ID, 2);
    expect(
      licenceProblems(withoutGym, [
        grantedAt('mp-khai-truong-phong-tap', 1, 3),
        { ...grantedAt('mp-spa-uu-dai-ngay-le', 1), itemId: DRAFT_ITEM_ID },
        { ...twoVersions, version: 3 },
        { ...grantedAt(TWO_VERSIONS_ITEM_ID, 1), versionHash: twoVersions.versionHash },
        grantedAt('mp-spa-uu-dai-ngay-le', 1),
      ]),
    ).toEqual([
      '✖ mp-khai-truong-phong-tap v1: the catalog no longer has this item (3 licences)',
      `✖ ${DRAFT_ITEM_ID} v1: the catalog marks this item as a draft (1 licence)`,
      `✖ ${TWO_VERSIONS_ITEM_ID} v3: the catalog no longer has this version (1 licence)`,
      `✖ ${TWO_VERSIONS_ITEM_ID} v1: the content of this version is not what was granted (versionHash) (1 licence)`,
    ]);
  });

  it('names a version whose content changed in the file after it was granted', () => {
    const granted = grantedAt('mp-mo-ban-du-an-can-ho', 1, 4);
    const edited = {
      ...catalog,
      items: catalog.items.map((item) =>
        item.id === 'mp-mo-ban-du-an-can-ho'
          ? {
              ...item,
              versions: item.versions.map((version) => ({
                ...version,
                composition: {
                  ...version.composition,
                  sections: version.composition.sections.slice(1),
                },
              })),
            }
          : item,
      ),
    };
    expect(licenceProblems(edited, [granted])).toEqual([
      '✖ mp-mo-ban-du-an-can-ho v1: the content of this version is not what was granted (versionHash) (4 licences)',
    ]);
  });
});
