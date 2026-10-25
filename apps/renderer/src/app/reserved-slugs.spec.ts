import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { reservedSlugs } from '@plp/contracts';
import { describe, expect, it } from 'vitest';

/** Top-level paths the renderer answers itself: one per route folder of this directory. */
function topLevelRoutes(): string[] {
  return (
    readdirSync(fileURLToPath(new URL('.', import.meta.url)), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      // Dynamic segments are the page route itself; route groups and private folders are not paths.
      .filter((entry) => !/^[[(_]/.test(entry.name))
      // "%5F" spells a leading underscore in a URL path (`_preview`).
      .map((entry) => decodeURIComponent(entry.name))
  );
}

describe('reserved slugs', () => {
  it('cover every top-level route of the renderer, so no page is published where it never shows', () => {
    const routes = topLevelRoutes();
    expect(routes).toEqual(
      expect.arrayContaining(['_preview', '_lead', 'api', 'healthz', 'robots.txt', 'sitemap.xml']),
    );
    expect(reservedSlugs).toEqual(expect.arrayContaining(routes));
  });

  it("cover the paths Next keeps for itself (its assets, '/index' and its error pages)", () => {
    expect(reservedSlugs).toEqual(
      expect.arrayContaining(['_next', 'index', '404', '500', 'favicon.ico']),
    );
  });
});
