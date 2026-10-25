import { describe, expect, it, vi } from 'vitest';
import { notFoundGate } from './not-found-gate';

const RELEASE_ID = 'c'.repeat(24);
const found = vi.fn(() => Promise.resolve({ kind: 'page' as const, releaseId: RELEASE_ID }));
const missing = vi.fn(() => Promise.resolve(null));

describe('notFoundGate', () => {
  it('renders a live page and names its live release', async () => {
    expect(await notFoundGate({ subdomain: 'smilecare', pathname: '/uu-dai' }, found)).toEqual({
      kind: 'render',
      liveReleaseId: RELEASE_ID,
    });
    expect(found).toHaveBeenLastCalledWith('smilecare', 'uu-dai');
    expect(await notFoundGate({ subdomain: 'smilecare', pathname: '/' }, found)).toEqual({
      kind: 'render',
      liveReleaseId: RELEASE_ID,
    });
    expect(found).toHaveBeenLastCalledWith('smilecare', '');
  });

  it('renders a redirect, which has no live release of its own', async () => {
    const redirect = vi.fn(() => Promise.resolve({ kind: 'redirect' as const }));
    expect(await notFoundGate({ subdomain: 'smilecare', pathname: '/cu' }, redirect)).toEqual({
      kind: 'render',
      liveReleaseId: null,
    });
  });

  it('answers not found when nothing answers at the path', async () => {
    expect(await notFoundGate({ subdomain: 'smilecare', pathname: '/khong-co' }, missing)).toEqual({
      kind: 'not_found',
    });
  });

  it('answers not found without asking the API for a non-site host or an impossible path', async () => {
    const lookup = vi.fn(() => Promise.resolve({ kind: 'page' as const, releaseId: RELEASE_ID }));
    for (const request of [
      { subdomain: null, pathname: '/uu-dai' },
      { subdomain: 'smilecare', pathname: '/a/b' },
      { subdomain: 'smilecare', pathname: '/Uu-Dai' },
      { subdomain: 'smilecare', pathname: '/favicon.ico' },
      { subdomain: 'smilecare', pathname: '/%E0%A4%A' },
    ]) {
      expect(await notFoundGate(request, lookup)).toEqual({ kind: 'not_found' });
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it('lets lookup failures reach the caller', async () => {
    const failing = vi.fn(() => Promise.reject(new Error('API down')));
    await expect(
      notFoundGate({ subdomain: 'smilecare', pathname: '/uu-dai' }, failing),
    ).rejects.toThrow('API down');
  });
});
