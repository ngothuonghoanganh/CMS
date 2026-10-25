import type { Composition } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { createSectionInstance } from './registry.js';
import { firstHeroHeading, seoTitleOf } from './seo.js';

function page(...headings: string[]): Composition {
  return {
    version: 1,
    sections: [
      createSectionInstance('navbar', undefined, 'navbar000001'),
      ...headings.map((heading, index) => {
        const hero = createSectionInstance('hero', undefined, `hero0000000${index}`);
        return { ...hero, content: { ...hero.content, heading } };
      }),
    ],
  };
}

describe('SEO title', () => {
  it('uses the SEO title, then the first Hero heading that has text, then the site name', () => {
    expect(seoTitleOf(' Ưu đãi | Smile Care ', page('Niềng răng'), 'Smile Care')).toBe(
      'Ưu đãi | Smile Care',
    );
    expect(seoTitleOf('', page('  ', 'Niềng răng trong suốt'), 'Smile Care')).toBe(
      'Niềng răng trong suốt',
    );
    expect(seoTitleOf(' ', page(), 'Nha khoa Smile Care')).toBe('Nha khoa Smile Care');
    expect(seoTitleOf('', page(''), 'Nha khoa Smile Care')).toBe('Nha khoa Smile Care');
  });

  it('finds no Hero heading on a page without one', () => {
    expect(firstHeroHeading(page())).toBeNull();
    expect(firstHeroHeading(page(' Tiêu đề '))).toBe('Tiêu đề');
  });
});
