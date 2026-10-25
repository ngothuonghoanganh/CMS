import { describe, expect, it } from 'vitest';
import { isPlausiblePreviewToken, sameSiteLocation, slugFromSegments } from './routing';

describe('slugFromSegments', () => {
  it('maps "/" to the home page slug', () => {
    expect(slugFromSegments(undefined)).toBe('');
    expect(slugFromSegments([])).toBe('');
  });

  it('accepts one valid slug segment', () => {
    expect(slugFromSegments(['uu-dai-thang-11'])).toBe('uu-dai-thang-11');
  });

  it('rejects deeper paths because slugs have no slashes', () => {
    expect(slugFromSegments(['uu-dai', 'chi-tiet'])).toBeNull();
  });

  it('rejects segments no page can use', () => {
    expect(slugFromSegments(['Uu-Dai'])).toBeNull();
    expect(slugFromSegments(['favicon.ico'])).toBeNull();
    expect(slugFromSegments(['wp-login.php'])).toBeNull();
    expect(slugFromSegments(['_preview'])).toBeNull();
    expect(slugFromSegments([''])).toBeNull();
    expect(slugFromSegments([' uu-dai'])).toBeNull();
    expect(slugFromSegments(['a'.repeat(81)])).toBeNull();
  });
});

describe('sameSiteLocation', () => {
  it('keeps absolute paths', () => {
    expect(sameSiteLocation('/')).toBe('/');
    expect(sameSiteLocation('/uu-dai')).toBe('/uu-dai');
  });

  it('refuses locations that could leave the site', () => {
    expect(() => sameSiteLocation('https://evil.example/')).toThrow();
    expect(() => sameSiteLocation('//evil.example')).toThrow();
    expect(() => sameSiteLocation('/\\evil.example')).toThrow();
    expect(() => sameSiteLocation('uu-dai')).toThrow();
  });
});

describe('isPlausiblePreviewToken', () => {
  it('accepts a compact JWS', () => {
    expect(
      isPlausiblePreviewToken('eyJhbGciOiJIUzI1NiJ9.eyJraW5kIjoiZHJhZnQifQ.c2lnbmF0dXJl'),
    ).toBe(true);
  });

  it('rejects other strings', () => {
    expect(isPlausiblePreviewToken('not-a-token')).toBe(false);
    expect(isPlausiblePreviewToken('a.b')).toBe(false);
    expect(isPlausiblePreviewToken('a.b.c.d')).toBe(false);
    expect(isPlausiblePreviewToken('a.b.c<script>')).toBe(false);
    expect(isPlausiblePreviewToken(`${'a'.repeat(4096)}.b.c`)).toBe(false);
  });
});
