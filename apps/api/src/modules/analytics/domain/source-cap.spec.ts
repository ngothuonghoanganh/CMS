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

  it('never folds direct or search engine visits, nor lets them take a place', async () => {
    const registry = new SourceCapRegistry();
    const direct = { source: '(direct)', medium: '(none)' };
    const google = { source: 'google', medium: 'organic' };
    // Stored today: the standard pairs and 49 made-up campaign tags.
    const stored = [direct, google, ...Array.from({ length: 49 }, (_, index) => pair(index))];
    const today = () => Promise.resolve(stored);
    expect(await registry.pairFor('site-a', '2026-10-25', pair(49), today)).toEqual(pair(49));
    expect(await registry.pairFor('site-a', '2026-10-25', pair(50), today)).toEqual(
      ANALYTICS_OTHER_SOURCE,
    );
    for (const standard of [direct, google, { source: 'coccoc', medium: 'organic' }]) {
      expect(await registry.pairFor('site-a', '2026-10-25', standard, today)).toEqual(standard);
    }
    // Only a search engine's organic visits are standard; any other tag takes a place.
    expect(
      await registry.pairFor('site-a', '2026-10-25', { source: 'google', medium: 'cpc' }, today),
    ).toEqual(ANALYTICS_OTHER_SOURCE);
  });

  it('loads a site’s pairs once while views arrive together, and keeps to 50', async () => {
    const registry = new SourceCapRegistry();
    const stored = vi.fn(async () => {
      await new Promise((done) => setTimeout(done, 5));
      return [] as SourcePair[];
    });
    const pairs = await Promise.all(
      Array.from({ length: 60 }, (_, index) =>
        registry.pairFor('site-a', '2026-10-25', pair(index), stored),
      ),
    );
    expect(stored).toHaveBeenCalledTimes(1);
    expect(pairs.slice(0, 50)).toEqual(Array.from({ length: 50 }, (_, index) => pair(index)));
    expect(pairs.slice(50)).toEqual(Array.from({ length: 10 }, () => ANALYTICS_OTHER_SOURCE));
  });

  it('loads again after a load fails, which the waiting views see', async () => {
    const registry = new SourceCapRegistry();
    const stored = vi
      .fn<() => Promise<SourcePair[]>>()
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValue([]);
    await expect(registry.pairFor('site-a', '2026-10-25', pair(1), stored)).rejects.toThrow(
      'database unavailable',
    );
    expect(await registry.pairFor('site-a', '2026-10-25', pair(1), stored)).toEqual(pair(1));
    expect(stored).toHaveBeenCalledTimes(2);
  });

  it('keeps pairs apart whatever characters they hold', async () => {
    const registry = new SourceCapRegistry();
    const full = [
      { source: 'a\nb', medium: 'c' },
      ...Array.from({ length: 49 }, (_, index) => pair(index)),
    ];
    // Joined by a line break, these two would be the same pair.
    expect(
      await registry.pairFor('site-a', '2026-10-25', { source: 'a', medium: 'b\nc' }, () =>
        Promise.resolve(full),
      ),
    ).toEqual(ANALYTICS_OTHER_SOURCE);
  });
});
