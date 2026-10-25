import { describe, expect, it } from 'vitest';
import { LIVE_RELEASE_HEADER, liveReleaseFrom } from './live-release';

describe('liveReleaseFrom', () => {
  it('reads the release id the proxy forwarded', () => {
    const id = 'a'.repeat(24);
    expect(liveReleaseFrom(new Headers({ [LIVE_RELEASE_HEADER]: id }))).toBe(id);
  });

  it('is empty when the header is missing or is not a release id', () => {
    expect(liveReleaseFrom(new Headers())).toBe('');
    expect(liveReleaseFrom(new Headers({ [LIVE_RELEASE_HEADER]: 'v2' }))).toBe('');
    expect(liveReleaseFrom(new Headers({ [LIVE_RELEASE_HEADER]: 'A'.repeat(24) }))).toBe('');
  });
});
