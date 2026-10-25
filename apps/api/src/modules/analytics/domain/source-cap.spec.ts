import { ANALYTICS_OTHER_SOURCE } from '@plp/contracts';
import { describe, expect, it, vi } from 'vitest';
import { SourceCapRegistry, type SourcePair } from './source-cap.js';

const pair = (index: number): SourcePair => ({ source: `nguon-${String(index)}`, medium: 'cpc' });

describe('SourceCapRegistry', () => {
  it('keeps 50 pairs a day per site and counts the next new ones as "khác"', async () => {
    const registry = new SourceCapRegistry();
    const stored = vi.fn(() => Promise.resolve([] as SourcePair[]));
    for (let index = 0; index < 50; index += 1) {
      expect(await registry.pairFor('site-a', '2026-10-25', pair(index), stored)).toEqual(
        pair(index),
      );
    }
    expect(await registry.pairFor('site-a', '2026-10-25', pair(50), stored)).toEqual(
      ANALYTICS_OTHER_SOURCE,
    );
    // A pair already counted today stays itself.
    expect(await registry.pairFor('site-a', '2026-10-25', pair(7), stored)).toEqual(pair(7));
    // Another site has its own pairs.
    expect(await registry.pairFor('site-b', '2026-10-25', pair(50), stored)).toEqual(pair(50));
    expect(stored).toHaveBeenCalledTimes(2);
  });

  it('starts from the pairs already stored for the day, and again the next day', async () => {
    const registry = new SourceCapRegistry();
    const full = Array.from({ length: 50 }, (_, index) => pair(index));
    expect(
      await registry.pairFor('site-a', '2026-10-25', pair(99), () => Promise.resolve(full)),
    ).toEqual(ANALYTICS_OTHER_SOURCE);
    expect(
      await registry.pairFor('site-a', '2026-10-26', pair(99), () => Promise.resolve([])),
    ).toEqual(pair(99));
  });
});
