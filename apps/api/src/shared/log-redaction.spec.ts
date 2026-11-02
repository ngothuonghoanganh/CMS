import { createHash } from 'node:crypto';
import { Writable } from 'node:stream';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import {
  HASH_PLACEHOLDER,
  LOG_REDACT_PATHS,
  REDACTED,
  redactPreviewToken,
  redactSearch,
  serializeError,
  serializeRequest,
} from './log-redaction.js';

const TOKEN = 'eyJhbGciOiJIUzI1NiIsImtpZCI6IjEifQ.eyJraW5kIjoiZHJhZnQifQ.c2lnbmF0dXJl';

describe('log redaction', () => {
  it('replaces the preview token in the URL path, with or without a query', () => {
    expect(redactPreviewToken(`/public/preview/${TOKEN}`)).toBe(`/public/preview/${REDACTED}`);
    expect(redactPreviewToken(`/public/preview/${TOKEN}/status`)).toBe(
      `/public/preview/${REDACTED}/status`,
    );
    expect(redactPreviewToken(`/public/preview/${TOKEN}?x=1`)).toBe(
      `/public/preview/${REDACTED}?x=1`,
    );
  });

  it('leaves other URLs alone', () => {
    expect(redactPreviewToken('/public/sites/smilecare/resolve?path=uu-dai')).toBe(
      '/public/sites/smilecare/resolve?path=uu-dai',
    );
    expect(redactPreviewToken('/pages/abc/preview-links')).toBe('/pages/abc/preview-links');
  });

  it('redacts url and params without mutating the route params of the request', () => {
    const params = { token: TOKEN };
    const serialized = serializeRequest({
      method: 'GET',
      url: `/public/preview/${TOKEN}`,
      params,
    });
    expect(serialized).toMatchObject({
      url: `/public/preview/${REDACTED}`,
      params: { token: REDACTED },
    });
    expect(params.token).toBe(TOKEN);
  });

  it('redacts the token where Express 5 middleware put it in the params', () => {
    const splat = ['public', 'preview', TOKEN];
    const serialized = serializeRequest({ url: `/public/preview/${TOKEN}`, params: { splat } });
    expect(serialized.params).toEqual({ splat: ['public', 'preview', REDACTED] });
    expect(splat[2]).toBe(TOKEN);
  });

  it('redacts the token in params that refer to themselves', () => {
    const params: Record<string, unknown> = { token: TOKEN };
    params['self'] = params;
    const serialized = serializeRequest({ url: `/public/preview/${TOKEN}`, params });
    expect(serialized.params).toMatchObject({ token: REDACTED, self: { token: REDACTED } });
    expect((serialized.params as { self: unknown }).self).toBe(serialized.params);
    expect(params['token']).toBe(TOKEN);
  });

  it('leaves the params of other requests alone', () => {
    const params = { siteId: 'abc' };
    expect(serializeRequest({ url: '/sites/abc', params }).params).toBe(params);
  });

  it('keeps the token out of a pino log line', () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(chunk.toString('utf8'));
        done();
      },
    });
    const logger = pino({ serializers: { req: serializeRequest } }, sink);
    logger.info({ req: { url: `/public/preview/${TOKEN}`, params: { token: TOKEN } } }, 'done');
    expect(lines.join('')).not.toContain(TOKEN);
    expect(lines.join('')).toContain(`/public/preview/${REDACTED}`);
  });

  it('replaces what a member searched for, wherever it sits in the query string', () => {
    expect(redactSearch('/sites/abc/leads?q=0901234567')).toBe(`/sites/abc/leads?q=${REDACTED}`);
    expect(redactSearch('/sites/abc/leads?folder=inbox&q=Nguy%E1%BB%85n&range=7d')).toBe(
      `/sites/abc/leads?folder=inbox&q=${REDACTED}&range=7d`,
    );
    expect(redactSearch('/sites/abc/leads?faq=1&range=7d')).toBe('/sites/abc/leads?faq=1&range=7d');
  });

  it('keeps a lead search out of the url and query of a log line, not of the live request', () => {
    const query = { folder: 'inbox', q: 'thuha@example.com' };
    const serialized = serializeRequest({
      url: '/sites/abc/leads?folder=inbox&q=thuha%40example.com',
      query,
    });
    expect(serialized).toMatchObject({
      url: `/sites/abc/leads?folder=inbox&q=${REDACTED}`,
      query: { folder: 'inbox', q: REDACTED },
    });
    expect(query.q).toBe('thuha@example.com');
  });

  it('keeps a search out of the Referer an admin page sends, without touching the live headers', () => {
    const headers = {
      referer: 'http://localhost:3100/sites/abc/leads?status=new&q=0901234567&lead=x',
      cookie: 'plp_session=secret',
    };
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(chunk.toString('utf8'));
        done();
      },
    });
    const logger = pino(
      { redact: [...LOG_REDACT_PATHS], serializers: { req: serializeRequest } },
      sink,
    );
    logger.info({ req: { method: 'GET', url: '/leads/x', headers } }, 'request completed');
    const output = lines.join('');
    expect(output).toContain(`q=${REDACTED}&lead=x`);
    expect(output).not.toContain('0901234567');
    expect(output).not.toContain('plp_session');
    expect(headers.referer).toContain('q=0901234567');
    expect(serializeRequest({ url: '/x', headers: { referer: 'http://a/b' } }).headers).toEqual({
      referer: 'http://a/b',
    });
  });

  it('keeps the visitor address, user agent and channel signature of a lead out of the log', () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(chunk.toString('utf8'));
        done();
      },
    });
    const logger = pino(
      { redact: [...LOG_REDACT_PATHS], serializers: { req: serializeRequest } },
      sink,
    );
    logger.info(
      {
        req: {
          method: 'POST',
          url: '/public/sites/smilecare/leads',
          headers: {
            'x-plp-client-ip': '203.0.113.7',
            'x-plp-client-ua': 'Mozilla/5.0 (iPhone; Nguyen Thu Ha)',
            'x-plp-renderer-signature': 'a'.repeat(64),
            cookie: 'plp_session=secret',
          },
        },
      },
      'request completed',
    );
    const output = lines.join('');
    expect(output).toContain('/public/sites/smilecare/leads');
    for (const secret of ['203.0.113.7', 'Nguyen Thu Ha', 'a'.repeat(64), 'plp_session']) {
      expect(output).not.toContain(secret);
    }
  });
});

/** The kind of value a limit key holds: the sha256 of an email address. */
const HASH = createHash('sha256').update('thuha@example.com').digest('hex');
const KEY = `recipient-invite:address:${HASH}`;

/**
 * Shaped like the MongoDB driver's server error (the integration test logs the real one): the
 * server's reply copied onto the error, and `errmsg` a getter of the message.
 */
class DriverError extends Error {
  override name = 'MongoServerError';
  readonly errorResponse: Record<string, unknown>;
  readonly code: unknown;
  readonly keyPattern: unknown;
  readonly keyValue: unknown;
  constructor(response: Record<string, unknown> & { errmsg: string }) {
    super(response.errmsg);
    this.errorResponse = response;
    this.code = response['code'];
    this.keyPattern = response['keyPattern'];
    this.keyValue = response['keyValue'];
  }
  get errmsg(): string {
    return this.message;
  }
}

/** A duplicate key error on a limit key, as the MongoDB driver raises it. */
function duplicateKey(): DriverError {
  return new DriverError({
    errmsg: `E11000 duplicate key error collection: plp.lead_limits index: key_1 dup key: { key: "${KEY}" }`,
    code: 11000,
    keyPattern: { key: 1 },
    keyValue: { key: KEY },
  });
}

/** Written as its hex string, like an ObjectId. */
class HexId {
  constructor(private readonly hex: string) {}
  toJSON(): string {
    return this.hex;
  }
}

/** Everything a serialized error would write to the log. */
function written(value: unknown): string {
  return JSON.stringify(value);
}

describe('serializeError', () => {
  it('replaces the hash in the message, stack, errmsg and keyValue of a driver error', () => {
    const error = duplicateKey();
    const serialized = serializeError(error);

    expect(written(serialized)).not.toContain(HASH);
    expect(serialized).toMatchObject({
      name: 'MongoServerError',
      message: expect.stringContaining(
        `dup key: { key: "recipient-invite:address:${HASH_PLACEHOLDER}" }`,
      ) as unknown,
      stack: expect.stringContaining(`recipient-invite:address:${HASH_PLACEHOLDER}`) as unknown,
      errmsg: expect.stringContaining(HASH_PLACEHOLDER) as unknown,
      keyValue: { key: `recipient-invite:address:${HASH_PLACEHOLDER}` },
      keyPattern: { key: 1 },
      code: 11000,
      errorResponse: { keyValue: { key: `recipient-invite:address:${HASH_PLACEHOLDER}` } },
    });
    // A copy: the error itself still says what it said.
    expect(error.keyValue).toEqual({ key: KEY });
    expect(error.message).toContain(HASH);
  });

  it('follows nested causes and the errors of an AggregateError', () => {
    const failed = new Error('Confirmation email could not be counted against the daily limits', {
      cause: new AggregateError(
        [duplicateKey(), new Error('wrapped', { cause: duplicateKey() })],
        'two counters failed',
      ),
    });
    const serialized = serializeError(failed);

    expect(written(serialized)).not.toContain(HASH);
    expect(serialized).toMatchObject({
      message: 'Confirmation email could not be counted against the daily limits',
      cause: {
        message: 'two counters failed',
        errors: [
          { keyValue: { key: `recipient-invite:address:${HASH_PLACEHOLDER}` } },
          {
            message: 'wrapped',
            cause: { errmsg: expect.stringContaining(HASH_PLACEHOLDER) as unknown },
          },
        ],
      },
    });
  });

  it('redacts the shape pino hands it after its standard error serializer', () => {
    // A cause's message and stack are folded into the error's own; an AggregateError's errors
    // come as `aggregateErrors`.
    for (const failed of [
      new Error('Confirmation email could not be counted', { cause: duplicateKey() }),
      new AggregateError([duplicateKey()], 'two counters failed'),
    ]) {
      const standard: unknown = pino.stdSerializers.err(failed);
      expect(written(standard)).toContain(HASH);

      const serialized = serializeError(standard);
      expect(written(serialized)).not.toContain(HASH);
      expect(written(serialized)).toContain(`recipient-invite:address:${HASH_PLACEHOLDER}`);
    }
  });

  it('keeps ids, dates and short hex readable', () => {
    const hex = '64b0000000000000000000a2';
    const at = new Date('2026-10-31T08:00:00.000Z');
    const error = Object.assign(new Error(`site ${hex} failed`), {
      siteId: new HexId(hex),
      at,
      requestId: '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e',
    });
    expect(serializeError(error)).toMatchObject({
      message: `site ${hex} failed`,
      siteId: hex,
      at: '2026-10-31T08:00:00.000Z',
      requestId: '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e',
    });
  });

  it('stops at cycles', () => {
    const looping = new Error(`looping on ${KEY}`);
    const context: Record<string, unknown> = { key: KEY };
    context['self'] = context;
    Object.assign(looping, { context, cause: looping });

    const serialized = serializeError(looping);
    expect(serialized).toMatchObject({
      cause: serialized,
      context: { self: { key: `recipient-invite:address:${HASH_PLACEHOLDER}` } },
    });
    expect(written({ message: (serialized as { message: unknown }).message })).not.toContain(HASH);
  });

  it('stops at a toJSON that refers back to its object, and the log line is written', () => {
    // A record that writes itself as a fresh object holding the record again.
    const record = {
      key: KEY,
      toJSON(): unknown {
        return { key: record.key, record };
      },
    };
    const failed = Object.assign(new Error('Counting failed'), { record });

    const serialized = serializeError(failed) as { record: { key: unknown; record: unknown } };
    expect(serialized.record.key).toBe(`recipient-invite:address:${HASH_PLACEHOLDER}`);
    expect(serialized.record.record).toBe(serialized.record);

    const lines: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(chunk.toString('utf8'));
        done();
      },
    });
    pino({ serializers: { err: serializeError } }, sink).error({ err: failed }, 'Unhandled error');
    expect(lines.join('')).toContain('Unhandled error');
    expect(lines.join('')).not.toContain(HASH);
  });

  it('keeps AI text out of an error, at any depth (ADR-031)', () => {
    const prompt = 'Product or service: Niềng răng bí mật';
    const request = { system: 'You write copy', prompt, schema: { name: 'section_hero' } };
    const error = new Error('AI request failed', {
      cause: Object.assign(new Error('upstream'), { request, output: '{"heading":"Bí mật"}' }),
    });
    const serialized = written(serializeError(error));
    expect(serialized).toContain('section_hero');
    expect(serialized).toContain(REDACTED);
    for (const text of [prompt, 'You write copy', 'Bí mật']) {
      expect(serialized).not.toContain(text);
    }
    // A driver error naming the job it could not store.
    const stored = new DriverError({
      errmsg: 'Document failed validation',
      code: 121,
      keyValue: { brief: { product: 'Niềng răng bí mật' } },
    });
    expect(written(serializeError(stored))).not.toContain('Niềng răng bí mật');
  });

  it('keeps AI text out of a pino log line, in the object logged or one level in', () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(chunk.toString('utf8'));
        done();
      },
    });
    const logger = pino({ redact: [...LOG_REDACT_PATHS] }, sink);
    logger.warn({ prompt: 'Lời nhắn bí mật', jobId: 'job-1' }, 'AI section not written');
    logger.warn({ request: { brief: 'Brief bí mật', system: 'Hệ thống bí mật' } }, 'AI');
    const output = lines.join('');
    expect(output).toContain('job-1');
    for (const text of ['Lời nhắn bí mật', 'Brief bí mật', 'Hệ thống bí mật']) {
      expect(output).not.toContain(text);
    }
  });

  it('keeps the hash out of an error a pino log line carries', () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(chunk.toString('utf8'));
        done();
      },
    });
    const logger = pino({ serializers: { err: serializeError } }, sink);
    logger.error({ err: new Error('Unhandled', { cause: duplicateKey() }) }, 'Unhandled error');
    const output = lines.join('');
    expect(output).toContain(HASH_PLACEHOLDER);
    expect(output).not.toContain(HASH);
  });
});
