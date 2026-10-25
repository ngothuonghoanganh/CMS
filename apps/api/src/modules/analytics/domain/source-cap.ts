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
 * already stored; views arriving meanwhile wait for the same load, so a burst cannot slip past the
 * cap. Direct and search engine visits are always themselves and never take a place: campaign tags
 * anyone can make up cannot crowd them out. Each API instance keeps its own pairs: with several
 * instances a site can count a few pairs more than the cap.
 */
export class SourceCapRegistry {
  private readonly sites = new Map<string, { day: VnDay; pairs: Promise<Set<string>> }>();

  async pairFor(
    siteId: string,
    day: VnDay,
    pair: SourcePair,
    stored: () => Promise<SourcePair[]>,
  ): Promise<SourcePair> {
    if (isStandardSource(pair)) {
      return pair;
    }
    const pairs = await this.pairsOf(siteId, day, stored);
    const key = sourcePairKey(pair);
    if (pairs.has(key)) {
      return pair;
    }
    if (pairs.size >= ANALYTICS_SOURCE_PAIRS_PER_DAY) {
      return ANALYTICS_OTHER_SOURCE;
    }
    pairs.add(key);
    return pair;
  }

  private pairsOf(
    siteId: string,
    day: VnDay,
    stored: () => Promise<SourcePair[]>,
  ): Promise<Set<string>> {
    const known = this.sites.get(siteId);
    if (known?.day === day) {
      return known.pairs;
    }
    const pairs = stored().then(
      (items) => new Set(items.filter((item) => !isStandardSource(item)).map(sourcePairKey)),
    );
    // A view of yesterday can get here after today's first view: its day was taken a few queries
    // earlier. It is checked against yesterday's pairs and leaves today's in place.
    if (known !== undefined && known.day > day) {
      return pairs;
    }
    const entry = { day, pairs };
    // One entry per site: yesterday's pairs are dropped when today's first view arrives.
    this.sites.set(siteId, entry);
    // The views waiting on a failed load get its error; the next view loads again.
    entry.pairs.catch(() => {
      if (this.sites.get(siteId) === entry) {
        this.sites.delete(siteId);
      }
    });
    return entry.pairs;
  }
}
