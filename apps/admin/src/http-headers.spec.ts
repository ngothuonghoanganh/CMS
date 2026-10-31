import { describe, expect, it } from 'vitest';
import { responseHeaderRules } from './http-headers';

/** The headers a path gets: rules are matched as Next does, by their `source` pattern. */
function headersFor(path: string, https = false): Record<string, string> {
  const rules = responseHeaderRules({ https }).filter((rule) =>
    // Both sources are plain regular expressions once the `:path*` parameter is spelled out.
    new RegExp(`^${rule.source.replace('/:path*', '(?:/.*)?')}$`).test(path),
  );
  return Object.fromEntries(
    rules.flatMap((rule) => rule.headers).map(({ key, value }) => [key, value]),
  );
}

describe('responseHeaderRules', () => {
  it('keeps every response out of frames, Referer headers and content sniffing', () => {
    expect(headersFor('/sites/64b000000000000000000001/leads')).toMatchObject({
      'Content-Security-Policy': "frame-ancestors 'none'",
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
    });
    expect(headersFor('/_next/static/chunks/main.js')).toMatchObject({
      'X-Content-Type-Options': 'nosniff',
    });
  });

  it('lets no cache keep a page, so Back after signing out asks the server again', () => {
    for (const path of ['/', '/login', '/sites/64b000000000000000000001/leads', '/sites/new']) {
      expect(headersFor(path)['Cache-Control']).toBe('no-store');
    }
  });

  it('leaves the long cache Next gives build files', () => {
    expect(headersFor('/_next/static/chunks/main.js')).not.toHaveProperty('Cache-Control');
    expect(headersFor('/_next/static/media/font.woff2')).not.toHaveProperty('Cache-Control');
  });

  it('asks browsers to keep using HTTPS only when the admin is served over it', () => {
    expect(headersFor('/login', true)['Strict-Transport-Security']).toBe('max-age=31536000');
    expect(headersFor('/login', false)).not.toHaveProperty('Strict-Transport-Security');
  });
});
