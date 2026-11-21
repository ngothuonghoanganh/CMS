import type { MarketplaceCatalog, MarketplaceItemVersion } from '@plp/contracts';
import { versionHashOf } from './version-hash.js';

/** Licences that name the same item, version and content, as the database groups them. */
export interface LicenceVersionGroup {
  itemId: string;
  version: number;
  versionHash: string;
  /** How many licences name them. */
  licences: number;
}

/**
 * What the catalog lacks for the licences workspaces hold (ADR-036): each licence must name an
 * item still in the file and not a draft, at a version still in the file whose content is what
 * was granted (`versionHash`). One line per problem, `✖ {itemId} v{N}: …`; none when the
 * catalog serves every licence. A withdrawn item is fine: its holders keep using it.
 */
export function licenceProblems(
  catalog: MarketplaceCatalog,
  groups: readonly LicenceVersionGroup[],
): string[] {
  const items = new Map(catalog.items.map((item) => [item.id, item]));
  const hashes = new Map<MarketplaceItemVersion, string>();
  const problems: string[] = [];
  for (const group of groups) {
    const problem = (what: string) =>
      `✖ ${group.itemId} v${group.version}: ${what} (${group.licences === 1 ? '1 licence' : `${group.licences} licences`})`;
    const item = items.get(group.itemId);
    if (item === undefined) {
      problems.push(problem('the catalog no longer has this item'));
      continue;
    }
    if (item.status === 'draft') {
      problems.push(problem('the catalog marks this item as a draft'));
      continue;
    }
    const version = item.versions.find((candidate) => candidate.version === group.version);
    if (version === undefined) {
      problems.push(problem('the catalog no longer has this version'));
      continue;
    }
    const hash = hashes.get(version) ?? versionHashOf(version.composition);
    hashes.set(version, hash);
    if (hash !== group.versionHash) {
      problems.push(problem('the content of this version is not what was granted (versionHash)'));
    }
  }
  return problems;
}
