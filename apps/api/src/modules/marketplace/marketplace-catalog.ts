import { readFileSync } from 'node:fs';
import { Inject } from '@nestjs/common';
import { type MarketplaceCatalog, marketplaceCatalogSchema } from '@plp/contracts';
import { z } from 'zod';
import { checkCatalogComposition } from './domain/catalog-composition.js';

export const MARKETPLACE_CATALOG = Symbol('MARKETPLACE_CATALOG');

/** Injects the marketplace catalog read at startup: `constructor(@InjectMarketplaceCatalog() c)`. */
export const InjectMarketplaceCatalog = (): ParameterDecorator => Inject(MARKETPLACE_CATALOG);

/**
 * Reads the marketplace catalog file (`MARKETPLACE_CATALOG_FILE`, ADR-036). It throws when the
 * file cannot be read, does not match `marketplaceCatalogSchema`, or holds a composition the
 * section registry refuses or that has an image or a link to another page, so the API does not
 * start with templates it cannot sell. Every problem of every version is named at once.
 */
export function loadMarketplaceCatalog(file: string): MarketplaceCatalog {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid marketplace catalog ${file}: it cannot be read as JSON`, {
      cause: error,
    });
  }
  const result = marketplaceCatalogSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid marketplace catalog ${file}:\n${z.prettifyError(result.error)}`);
  }
  const problems: string[] = [];
  const items = result.data.items.map((item) => ({
    ...item,
    versions: item.versions.map((version) => {
      const check = checkCatalogComposition(version.composition);
      if (!check.valid) {
        problems.push(
          ...check.problems.map((problem) => `${item.id} v${version.version}: ${problem}`),
        );
        return version;
      }
      return { ...version, composition: check.composition };
    }),
  }));
  if (problems.length > 0) {
    throw new Error(
      `Invalid marketplace catalog ${file}:\n${problems.map((problem) => `✖ ${problem}`).join('\n')}`,
    );
  }
  return { ...result.data, items };
}
