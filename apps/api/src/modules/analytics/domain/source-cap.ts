import { ANALYTICS_OTHER_SOURCE, ANALYTICS_SOURCE_PAIRS_PER_DAY, type VnDay } from '@plp/contracts';

export interface SourcePair {
  source: string;
  medium: string;
}

function keyOf(pair: SourcePair): string {
  return `${pair.source}\n${pair.medium}`;
}

/**
 * The source/medium pairs each site has counted today, so a new pair past the daily cap is counted
 * as "khác" (ADR-019) without a query per view. The first view of a site on a day loads the pairs
 * already stored. Each API instance keeps its own: with several instances a site can count a few
 * pairs more than the cap.
 */
export class SourceCapRegistry {
  private readonly sites = new Map<string, { day: VnDay; pairs: Set<string> }>();

  async pairFor(
    siteId: string,
    day: VnDay,
    pair: SourcePair,
    stored: () => Promise<SourcePair[]>,
  ): Promise<SourcePair> {
    let known = this.sites.get(siteId);
    if (known?.day !== day) {
      known = { day, pairs: new Set((await stored()).map(keyOf)) };
      // One entry per site: yesterday's pairs are dropped when today's first view arrives.
      this.sites.set(siteId, known);
    }
    const key = keyOf(pair);
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
