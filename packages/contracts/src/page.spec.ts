import { describe, expect, it } from 'vitest';
import { reservedSlugs, slugSchema } from './page.js';

describe('slugSchema', () => {
  it('accepts the home page and kebab-case slugs', () => {
    expect(slugSchema.parse('')).toBe('');
    expect(slugSchema.parse('uu-dai-thang-10')).toBe('uu-dai-thang-10');
    expect(slugSchema.parse('api-docs')).toBe('api-docs');
  });

  it.each(['healthz', 'index', '404', '500', 'api'])(
    'rejects "%s", which the renderer answers itself',
    (slug) => {
      const result = slugSchema.safeParse(slug);
      expect(result.success).toBe(false);
      expect(result.error?.issues.map((issue) => issue.message)).toEqual([
        'Đường dẫn này được hệ thống giữ lại',
      ]);
    },
  );

  it('rejects every reserved slug', () => {
    for (const slug of reservedSlugs) {
      expect(slugSchema.safeParse(slug).success).toBe(false);
    }
  });
});
