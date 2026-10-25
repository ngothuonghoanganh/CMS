import { revalidateTag } from 'next/cache';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signRevalidateRequest } from '../../../lib/revalidate-signature';
import { POST } from './route';

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));

const SECRET = 'r'.repeat(40);

function nowSeconds(): string {
  return String(Math.floor(Date.now() / 1000));
}

function webhook(
  body: string,
  options: { secret?: string; timestamp?: string; headers?: Record<string, string> } = {},
) {
  const timestamp = options.timestamp ?? nowSeconds();
  return new Request('http://localhost:3101/api/revalidate', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-plp-timestamp': timestamp,
      'x-plp-signature': signRevalidateRequest(options.secret ?? SECRET, timestamp, body),
      ...options.headers,
    },
    body,
  });
}

/** A webhook whose body is a stream, as a chunked upload arrives: it declares no Content-Length. */
function streamed(body: ReadableStream<Uint8Array>, headers: Record<string, string>): Request {
  // Node requires `duplex` for a stream body, which the DOM `RequestInit` type does not declare;
  // a variable, unlike an object literal, may carry the extra property without a cast.
  const init = { method: 'POST', headers, body, duplex: 'half' };
  const request = new Request('http://localhost:3101/api/revalidate', init);
  expect(request.headers.get('content-length')).toBeNull();
  return request;
}

beforeEach(() => {
  vi.stubEnv('API_PUBLIC_URL', 'http://api.test');
  vi.stubEnv('BASE_DOMAIN', 'localhost:3101');
  vi.stubEnv('PUBLIC_SITE_PROTOCOL', 'http');
  vi.stubEnv('REVALIDATE_SECRET', SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('POST /api/revalidate', () => {
  it('expires every tag immediately and lists them', async () => {
    const response = await POST(webhook(JSON.stringify({ tags: ['site:smilecare', 'site:a'] })));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revalidated: ['site:smilecare', 'site:a'] });
    expect(revalidateTag).toHaveBeenCalledTimes(2);
    expect(revalidateTag).toHaveBeenCalledWith('site:smilecare', { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledWith('site:a', { expire: 0 });
  });

  it('answers 401 for a wrong secret and revalidates nothing', async () => {
    const response = await POST(
      webhook(JSON.stringify({ tags: ['site:smilecare'] }), { secret: 'w'.repeat(40) }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized', reason: 'invalid_signature' });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('answers 401 for an old timestamp', async () => {
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    const response = await POST(webhook(JSON.stringify({ tags: ['site:x'] }), { timestamp: old }));
    expect(response.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('answers 401 without signature headers', async () => {
    const response = await POST(
      new Request('http://localhost:3101/api/revalidate', {
        method: 'POST',
        body: JSON.stringify({ tags: ['site:x'] }),
      }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ reason: 'missing_headers' });
  });

  it('answers 400 for a signed body that is not JSON or not a tag list', async () => {
    expect((await POST(webhook('not json'))).status).toBe(400);
    expect((await POST(webhook(JSON.stringify({ tags: [] })))).status).toBe(400);
    expect((await POST(webhook(JSON.stringify({ paths: ['/'] })))).status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('answers 413 for an oversized body', async () => {
    const body = JSON.stringify({ tags: ['x'.repeat(20_000)] });
    expect((await POST(webhook(body))).status).toBe(413);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('stops reading a body without Content-Length once it passes 16 KB', async () => {
    // 1 MB in 1 KB chunks, produced only as the route reads them.
    const chunk = new TextEncoder().encode('a'.repeat(1024));
    let produced = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        produced += 1;
        if (produced > 1024) {
          controller.close();
        } else {
          controller.enqueue(chunk);
        }
      },
      cancel() {
        cancelled = true;
      },
    });

    const response = await POST(
      streamed(body, { 'x-plp-timestamp': nowSeconds(), 'x-plp-signature': 'a'.repeat(64) }),
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'payload_too_large' });
    // 17 chunks pass the limit; the stream may read one ahead.
    expect(produced).toBeLessThanOrEqual(18);
    expect(cancelled).toBe(true);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('accepts a signed body that arrives byte by byte without Content-Length', async () => {
    // One byte per chunk splits every multi-byte character, so pieces must not be decoded alone.
    const text = JSON.stringify({ tags: ['site:smilecare', 'nhãn:ưu-đãi'] });
    const bytes = new TextEncoder().encode(text);
    let offset = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset === bytes.length) {
          controller.close();
        } else {
          controller.enqueue(bytes.slice(offset, offset + 1));
          offset += 1;
        }
      },
    });
    const timestamp = nowSeconds();

    const response = await POST(
      streamed(body, {
        'x-plp-timestamp': timestamp,
        'x-plp-signature': signRevalidateRequest(SECRET, timestamp, text),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revalidated: ['site:smilecare', 'nhãn:ưu-đãi'] });
  });
});
