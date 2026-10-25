import { describe, expect, it } from 'vitest';
import { responseHeaderRules } from './http-headers';

function headersFor(source: string): Record<string, string> {
  const rule = responseHeaderRules().find((entry) => entry.source === source);
  return Object.fromEntries((rule?.headers ?? []).map(({ key, value }) => [key, value]));
}

describe('responseHeaderRules', () => {
  it('sends nosniff on every response', () => {
    expect(headersFor('/:path*')).toEqual({ 'X-Content-Type-Options': 'nosniff' });
  });

  it('keeps previews out of search engines, caches and Referer headers', () => {
    expect(headersFor('/_preview/:token*')).toEqual({
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
    });
  });

  it('keeps the lead route out of search engines, caches and Referer headers', () => {
    expect(headersFor('/_lead')).toEqual({
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
    });
  });
});
