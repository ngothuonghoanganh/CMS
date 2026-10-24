import { Logger } from '@nestjs/common';
import {
  REVALIDATE_SIGNATURE_HEADER,
  REVALIDATE_TIMESTAMP_HEADER,
  revalidateRequestSchema,
} from '@plp/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../../config/env.js';
import { testEnvInput } from '../../../test/env.js';
import { signRevalidation } from './revalidation-signature.js';
import { RevalidationClient } from './revalidation.client.js';

const env = parseEnv(
  testEnvInput({
    MONGODB_URI: 'mongodb://localhost:1/unused',
    RENDERER_INTERNAL_URL: 'http://renderer:3101/',
  }),
);

type FetchArgs = [input: string, init: RequestInit];

function stubFetch(...responses: (Response | Error)[]) {
  const calls: FetchArgs[] = [];
  const fetchMock = vi.fn((input: string, init: RequestInit) => {
    calls.push([input, init]);
    const next = responses.shift();
    if (next === undefined) {
      throw new Error('Unexpected fetch call');
    }
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

function header(init: RequestInit, name: string): string {
  const value = (init.headers as Record<string, string>)[name];
  if (value === undefined) {
    throw new Error(`Missing header ${name}`);
  }
  return value;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('RevalidationClient', () => {
  it('posts the signed site tag to the renderer', async () => {
    const calls = stubFetch(new Response(null, { status: 200 }));
    const result = await new RevalidationClient(env).revalidateSite('smilecare');
    expect(result).toBe('ok');
    const [[url, init]] = calls as [FetchArgs];
    expect(url).toBe('http://renderer:3101/api/revalidate');
    expect(init.method).toBe('POST');
    const body = init.body;
    if (typeof body !== 'string') {
      throw new Error('The revalidation body must be a JSON string');
    }
    expect(revalidateRequestSchema.parse(JSON.parse(body))).toEqual({ tags: ['site:smilecare'] });
    const timestamp = header(init, REVALIDATE_TIMESTAMP_HEADER);
    expect(Math.abs(Number(timestamp) - Date.now() / 1000)).toBeLessThan(5);
    expect(header(init, REVALIDATE_SIGNATURE_HEADER)).toBe(
      signRevalidation(env.REVALIDATE_SECRET, timestamp, body),
    );
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('retries once and succeeds on the second attempt', async () => {
    const calls = stubFetch(new Error('connection refused'), new Response(null, { status: 200 }));
    expect(await new RevalidationClient(env).revalidateSite('smilecare')).toBe('ok');
    expect(calls).toHaveLength(2);
  });

  it('reports a failure after two attempts without throwing, and logs a warning', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const calls = stubFetch(new Response('no', { status: 500 }), new Error('timeout'));
    expect(await new RevalidationClient(env).revalidateSite('smilecare')).toBe('failed');
    expect(calls).toHaveLength(2);
    expect(warn).toHaveBeenCalledTimes(1);
    const [context, message]: unknown[] = warn.mock.calls[0] ?? [];
    expect(context).toMatchObject({ attempts: 2, subdomain: 'smilecare' });
    expect((context as { err?: unknown }).err).toBeInstanceOf(Error);
    expect(message).toContain('Renderer revalidation failed');
  });
});
