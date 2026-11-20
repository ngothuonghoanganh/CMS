import { endpoints } from '@plp/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { callEndpoint, toQueryString } from './api-core';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('toQueryString', () => {
  it('keeps empty strings, which are real values such as the home page slug', () => {
    expect(toQueryString({ slug: '' })).toBe('?slug=');
    expect(toQueryString({ slug: '', pageId: 'abc' })).toBe('?slug=&pageId=abc');
  });

  it('leaves out undefined and null values', () => {
    expect(toQueryString({ status: undefined, q: null, limit: 20 })).toBe('?limit=20');
    expect(toQueryString({})).toBe('');
    expect(toQueryString(undefined)).toBe('');
  });
});

describe('callEndpoint', () => {
  it('asks for the availability of the home page slug', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        Response.json({ slug: '', available: true, reason: null, message: null }, { status: 200 }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await callEndpoint(
      '/api',
      endpoints.slugAvailability,
      ['64b000000000000000000001'],
      { query: { slug: '' } },
    );
    expect(result.available).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/sites/64b000000000000000000001/slug-availability?slug=',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('reports the status of a successful answer, so a 202 is told from a 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ received: true }, { status: 202 }))),
    );
    const onStatus = vi.fn();
    await callEndpoint('/api', endpoints.paymentGatewayWebhook, ['fake'], { onStatus });
    expect(onStatus).toHaveBeenCalledExactlyOnceWith(202);
  });
});
