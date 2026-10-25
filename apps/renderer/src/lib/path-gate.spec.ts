import type { PathStatusResponse } from '@plp/contracts';
import { describe, expect, it, vi } from 'vitest';
import { type PathStatusLookup, pathGate } from './path-gate';

const RELEASE_ID = 'c'.repeat(24);

function lookup(status: PathStatusResponse | null) {
  return vi.fn<PathStatusLookup>(() => Promise.resolve(status));
}

describe('pathGate', () => {
  it('renders a live page and names its live release', async () => {
    const found = lookup({ kind: 'page', releaseId: RELEASE_ID });
    expect(await pathGate({ subdomain: 'smilecare', pathname: '/uu-dai' }, found)).toEqual({
      kind: 'render',
      liveReleaseId: RELEASE_ID,
    });
    expect(found).toHaveBeenLastCalledWith('smilecare', 'uu-dai');
    expect(await pathGate({ subdomain: 'smilecare', pathname: '/' }, found)).toEqual({
      kind: 'render',
      liveReleaseId: RELEASE_ID,
    });
    expect(found).toHaveBeenLastCalledWith('smilecare', '');
  });

  it('answers a redirect itself with the location the old slug moved to, in one lookup', async () => {
    const moved = lookup({ kind: 'redirect', location: '/moi' });
    expect(await pathGate({ subdomain: 'smilecare', pathname: '/cu' }, moved)).toEqual({
      kind: 'redirect',
      location: '/moi',
    });
    expect(moved).toHaveBeenCalledOnce();
    expect(moved).toHaveBeenCalledWith('smilecare', 'cu');
  });

  it('rejects a redirect that would leave the site', async () => {
    for (const location of ['//evil.example/x', 'https://evil.example/', '/\\evil.example']) {
      await expect(
        pathGate(
          { subdomain: 'smilecare', pathname: '/cu' },
          lookup({ kind: 'redirect', location }),
        ),
      ).rejects.toThrow('leaves the site');
    }
  });

  it('answers not found when nothing answers at the path', async () => {
    expect(await pathGate({ subdomain: 'smilecare', pathname: '/khong-co' }, lookup(null))).toEqual(
      { kind: 'not_found' },
    );
  });

  it('answers not found without asking the API for a non-site host or an impossible path', async () => {
    const status = lookup({ kind: 'page', releaseId: RELEASE_ID });
    for (const request of [
      { subdomain: null, pathname: '/uu-dai' },
      { subdomain: 'smilecare', pathname: '/a/b' },
      { subdomain: 'smilecare', pathname: '/Uu-Dai' },
      { subdomain: 'smilecare', pathname: '/favicon.ico' },
      { subdomain: 'smilecare', pathname: '/%E0%A4%A' },
    ]) {
      expect(await pathGate(request, status)).toEqual({ kind: 'not_found' });
    }
    expect(status).not.toHaveBeenCalled();
  });

  it('lets lookup failures reach the caller', async () => {
    const failing: PathStatusLookup = () => Promise.reject(new Error('API down'));
    await expect(
      pathGate({ subdomain: 'smilecare', pathname: '/uu-dai' }, failing),
    ).rejects.toThrow('API down');
  });
});
