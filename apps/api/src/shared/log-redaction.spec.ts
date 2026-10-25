import { Writable } from 'node:stream';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import {
  LOG_REDACT_PATHS,
  REDACTED,
  redactPreviewToken,
  serializeRequest,
} from './log-redaction.js';

const TOKEN = 'eyJhbGciOiJIUzI1NiIsImtpZCI6IjEifQ.eyJraW5kIjoiZHJhZnQifQ.c2lnbmF0dXJl';

describe('log redaction', () => {
  it('replaces the preview token in the URL path, with or without a query', () => {
    expect(redactPreviewToken(`/public/preview/${TOKEN}`)).toBe(`/public/preview/${REDACTED}`);
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
