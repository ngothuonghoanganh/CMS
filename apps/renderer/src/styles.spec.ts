import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Every stylesheet of the renderer itself; the sections check their own (styles.spec there). */
const STYLESHEETS = readdirSync(new URL('.', import.meta.url), { recursive: true })
  .map(String)
  .filter((file) => file.endsWith('.css'));

describe('renderer breakpoints', () => {
  // `max-width: 767px` next to `min-width: 768px` leaves a gap that a fractional width (browser
  // zoom, classic scrollbars) falls into; range syntax splits at one point.
  it('use range syntax', () => {
    const conditions = STYLESHEETS.flatMap((file) =>
      [
        ...readFileSync(new URL(file, import.meta.url), 'utf8').matchAll(
          /@(?:container|media)\s+([^{]+)\{/g,
        ),
      ].map(([, condition = '']) => ({ file, condition: condition.trim() })),
    );
    const widths = conditions.filter(({ condition }) => condition.includes('width'));
    expect(widths.length).toBeGreaterThanOrEqual(1);
    for (const { file, condition } of widths) {
      expect(condition, file).not.toMatch(/(min|max)-width/);
      expect(condition, file).toMatch(/\(width (<|>=) \d+px\)/);
    }
  });
});
