import { describe, expect, it } from 'vitest';
import { authPageHref, safeNextPath } from './next-path';

describe('safeNextPath', () => {
  it('keeps a same-origin path with its query and hash', () => {
    expect(safeNextPath('/sites/abc')).toBe('/sites/abc');
    expect(safeNextPath('/sites/abc?status=live&q=uu%20dai#top')).toBe(
      '/sites/abc?status=live&q=uu%20dai#top',
    );
  });

  it('falls back to "/" when nothing usable is given', () => {
    expect(safeNextPath(undefined)).toBe('/');
    expect(safeNextPath(null)).toBe('/');
    expect(safeNextPath('')).toBe('/');
    expect(safeNextPath(['/sites/a', '/sites/b'])).toBe('/');
  });

  it('rejects absolute and protocol-relative URLs', () => {
    expect(safeNextPath('https://evil.example/sites')).toBe('/');
    expect(safeNextPath('//evil.example/sites')).toBe('/');
    expect(safeNextPath('javascript:alert(1)')).toBe('/');
    expect(safeNextPath('sites/abc')).toBe('/');
  });

  it('rejects backslashes and control characters that browsers normalise away', () => {
    expect(safeNextPath('/\\evil.example')).toBe('/');
    expect(safeNextPath('/\tevil')).toBe('/');
    expect(safeNextPath('/%0d%0aSet-Cookie')).toBe('/%0d%0aSet-Cookie');
  });

  it('never sends the user back to a sign-in page', () => {
    expect(safeNextPath('/login')).toBe('/');
    expect(safeNextPath('/signup?next=/sites')).toBe('/');
  });

  it('normalises dot segments without leaving the origin', () => {
    expect(safeNextPath('/sites/../domain')).toBe('/domain');
    expect(safeNextPath('/../../etc')).toBe('/etc');
  });

  it('rejects dot segments that normalise into a protocol-relative URL', () => {
    expect(safeNextPath('/.//evil.example')).toBe('/');
    expect(safeNextPath('/..//evil.example/x')).toBe('/');
    expect(safeNextPath('/%2e//evil.example')).toBe('/');
    expect(safeNextPath('/%2E%2E//evil.example')).toBe('/');
    expect(safeNextPath('/a/..//evil.example')).toBe('/');
    expect(safeNextPath('/sites/.//abc')).toBe('/sites//abc');
  });
});

describe('authPageHref', () => {
  it('adds the next path only when it is not the home page', () => {
    expect(authPageHref('/signup', '/')).toBe('/signup');
    expect(authPageHref('/login', '/sites/abc?status=live')).toBe(
      '/login?next=%2Fsites%2Fabc%3Fstatus%3Dlive',
    );
  });
});
