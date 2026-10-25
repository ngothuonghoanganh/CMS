import { describe, expect, it } from 'vitest';
import { parseRendererEnv } from './env';

const valid = {
  API_PUBLIC_URL: 'http://localhost:4100',
  BASE_DOMAIN: 'localhost:3101',
  PUBLIC_SITE_PROTOCOL: 'http',
  REVALIDATE_SECRET: 'x'.repeat(32),
  RENDERER_API_SECRET: 'y'.repeat(32),
};

describe('parseRendererEnv', () => {
  it('accepts the development values and defaults TRUST_PROXY to false', () => {
    expect(parseRendererEnv(valid)).toEqual({ ...valid, TRUST_PROXY: false });
  });

  it('reads TRUST_PROXY=true', () => {
    expect(parseRendererEnv({ ...valid, TRUST_PROXY: 'true' }).TRUST_PROXY).toBe(true);
  });

  it('drops a trailing slash from the API URL and lowercases the base domain', () => {
    const env = parseRendererEnv({
      ...valid,
      API_PUBLIC_URL: 'https://api.payload.site/',
      BASE_DOMAIN: 'Payload.Site',
    });
    expect(env.API_PUBLIC_URL).toBe('https://api.payload.site');
    expect(env.BASE_DOMAIN).toBe('payload.site');
  });

  it('fails fast when a variable is missing', () => {
    const { API_PUBLIC_URL: _omitted, ...withoutApi } = valid;
    expect(() => parseRendererEnv(withoutApi)).toThrow(/API_PUBLIC_URL/);
  });

  it('rejects a short revalidation secret without echoing it', () => {
    let message = '';
    try {
      parseRendererEnv({ ...valid, REVALIDATE_SECRET: 'too-short-secret' });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/REVALIDATE_SECRET/);
    expect(message).not.toContain('too-short-secret');
    expect(() => parseRendererEnv({ ...valid, RENDERER_API_SECRET: 'short' })).toThrow(
      /RENDERER_API_SECRET/,
    );
  });

  it('rejects a base domain with a scheme or path', () => {
    expect(() => parseRendererEnv({ ...valid, BASE_DOMAIN: 'https://payload.site' })).toThrow(
      /BASE_DOMAIN/,
    );
    expect(() => parseRendererEnv({ ...valid, BASE_DOMAIN: 'payload.site/x' })).toThrow(
      /BASE_DOMAIN/,
    );
  });

  it('rejects an unknown protocol and a non-boolean TRUST_PROXY', () => {
    expect(() => parseRendererEnv({ ...valid, PUBLIC_SITE_PROTOCOL: 'ftp' })).toThrow(
      /PUBLIC_SITE_PROTOCOL/,
    );
    expect(() => parseRendererEnv({ ...valid, TRUST_PROXY: 'yes' })).toThrow(/TRUST_PROXY/);
  });
});
