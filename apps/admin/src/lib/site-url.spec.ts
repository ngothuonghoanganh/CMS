import { describe, expect, it } from 'vitest';
import { defaultHostPreview, displayUrl, hostOf, internalVisitUrl, slugPath } from './site-url';

describe('hostOf', () => {
  it('returns the host with its port', () => {
    expect(hostOf('https://smilecare.payload.site')).toBe('smilecare.payload.site');
    expect(hostOf('http://smilecare.localhost:3101/')).toBe('smilecare.localhost:3101');
  });
});

describe('displayUrl', () => {
  it('drops the protocol and the trailing slash', () => {
    expect(displayUrl('https://smilecare.payload.site/')).toBe('smilecare.payload.site');
    expect(displayUrl('https://smilecare.payload.site/uu-dai')).toBe(
      'smilecare.payload.site/uu-dai',
    );
    expect(displayUrl('http://smilecare.localhost:3101/uu-dai/')).toBe(
      'smilecare.localhost:3101/uu-dai',
    );
  });
});

describe('slugPath', () => {
  it('shows the home page as "/"', () => {
    expect(slugPath('')).toBe('/');
    expect(slugPath('uu-dai-thang-11')).toBe('/uu-dai-thang-11');
  });
});

describe('default host from the origin template', () => {
  it('builds the host shown while typing a subdomain', () => {
    expect(defaultHostPreview('https://{subdomain}.payload.site', 'smilecare')).toBe(
      'smilecare.payload.site',
    );
    expect(defaultHostPreview('http://{subdomain}.localhost:3101/', 'smile')).toBe(
      'smile.localhost:3101',
    );
  });
});

describe('internalVisitUrl', () => {
  it('flags a live page opened from the admin, keeping its own query', () => {
    expect(internalVisitUrl('https://smilecare.payload.site')).toBe(
      'https://smilecare.payload.site/?plp_internal=1',
    );
    expect(internalVisitUrl('http://smilecare.localhost:3101/uu-dai?utm_source=zalo')).toBe(
      'http://smilecare.localhost:3101/uu-dai?utm_source=zalo&plp_internal=1',
    );
  });
});
