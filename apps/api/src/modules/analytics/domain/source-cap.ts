import { ANALYTICS_OTHER_SOURCE, ANALYTICS_SOURCE_PAIRS_PER_DAY, type VnDay } from '@plp/contracts';
import { isStandardSource } from '../../leads/domain/lead-source.js';

export interface SourcePair {
  source: string;
  medium: string;
}

/** One key per pair, whatever characters its values hold. */
export function sourcePairKey(pair: SourcePair): string {
  return JSON.stringify([pair.source, pair.medium]);
}

/**
 * The source/medium pairs each site has counted today, so a new pair past the daily cap is counted
 * as "khác" (ADR-019) without a query per view. The first view of a site on a day loads the pairs
 * already stored. Direct and search engine visits are always themselves and never take a place:
 * campaign tags anyone can make up cannot crowd them out. Each API instance keeps its own pairs:
 * with several instances a site can count a few pairs more than the cap.
 */
export class SourceCapRegistry {
  private readonly sites = new Map<string, { day: VnDay; pairs: Set<string> }>();

  async pairFor(
    siteId: string,
    day: VnDay,
    pair: SourcePair,
    stored: () => Promise<SourcePair[]>,
  ): Promise<SourcePair> {
    if (isStandardSource(pair)) {
      return pair;
    }
    let known = this.sites.get(siteId);
    if (known?.day !== day) {
      const capped = (await stored()).filter((item) => !isStandardSource(item));
      known = { day, pairs: new Set(capped.map(sourcePairKey)) };
      // One entry per site: yesterday's pairs are dropped when today's first view arrives.
      this.sites.set(siteId, known);
    }
    const key = sourcePairKey(pair);
    if (known.pairs.has(key)) {
      return pair;
    }
    if (known.pairs.size >= ANALYTICS_SOURCE_PAIRS_PER_DAY) {
      return ANALYTICS_OTHER_SOURCE;
    }
    known.pairs.add(key);
    return pair;
  }
}
