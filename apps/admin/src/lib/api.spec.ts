import { aiJobEventSchema, endpoints } from '@plp/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, attachmentFilename, downloadFile, splitLines, streamEndpoint } from './api';

describe('streamEndpoint (ADR-031)', () => {
  const SITE_ID = '64b000000000000000000001';
  const JOB_ID = '64b000000000000000000002';

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('splits what arrived into whole lines, keeping the rest for later', () => {
    expect(splitLines('{"a":1}\n\n{"b":2}\n{"c"')).toEqual({
      lines: ['{"a":1}', '{"b":2}'],
      rest: '{"c"',
    });
    expect(splitLines('')).toEqual({ lines: [], rest: '' });
  });

  it('hands each line to the caller as it arrives, across chunk boundaries', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      '{"type":"heartbeat"}\n{"type":"sec',
      'tion","sectionId":"abcdefgh1234",',
      '"status":"done"}\n',
    ];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(body, { headers: { 'Content-Type': 'application/x-ndjson' } })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const events: unknown[] = [];
    await streamEndpoint(
      endpoints.retryAiPageJob,
      [SITE_ID, JOB_ID],
      {},
      aiJobEventSchema,
      (event) => {
        events.push(event);
      },
    );
    expect(events).toEqual([
      { type: 'heartbeat' },
      { type: 'section', sectionId: 'abcdefgh1234', status: 'done' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(`/api/sites/${SITE_ID}/ai/page-jobs/${JOB_ID}/retry`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/x-ndjson' },
    });
  });

  it('throws the problem of a refused request before any line', async () => {
    const problem = {
      type: 'about:blank',
      title: 'Workspace đã dùng hết 100 lượt AI tháng này',
      status: 429,
      code: 'ai_quota_exhausted',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify(problem), {
            status: 429,
            headers: { 'Content-Type': 'application/problem+json' },
          }),
        ),
      ),
    );
    const onEvent = vi.fn();
    await expect(
      streamEndpoint(endpoints.retryAiPageJob, [SITE_ID, JOB_ID], {}, aiJobEventSchema, onEvent),
    ).rejects.toMatchObject({ code: 'ai_quota_exhausted' });
    expect(onEvent).not.toHaveBeenCalled();
  });
});

describe('attachmentFilename', () => {
  it('reads the name the server gave a download', () => {
    expect(attachmentFilename('attachment; filename="leads-smilecare-2026-10-25.csv"')).toBe(
      'leads-smilecare-2026-10-25.csv',
    );
    expect(attachmentFilename('inline')).toBeNull();
    expect(attachmentFilename(null)).toBeNull();
  });
});

describe('downloadFile', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('posts the filters through the API proxy, saves the file and reports a cut export', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response('﻿Thời gian\r\n', {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="leads-smilecare-2026-10-25.csv"',
            'X-Export-Truncated': 'true',
          },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    // jsdom has no object URLs.
    class ObjectUrls extends URL {
      static override createObjectURL = vi.fn(() => 'blob:leads');
      static override revokeObjectURL = vi.fn();
    }
    vi.stubGlobal('URL', ObjectUrls);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      // jsdom does not download.
    });

    const file = await downloadFile(endpoints.exportLeads, ['64b000000000000000000001'], {
      body: { folder: 'inbox', range: 'all' },
    });

    expect(file).toEqual({ truncated: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/sites/64b000000000000000000001/leads/export', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder: 'inbox', range: 'all' }),
    });
    expect(click).toHaveBeenCalledOnce();
    expect(click.mock.contexts[0]).toMatchObject({
      href: 'blob:leads',
      download: 'leads-smilecare-2026-10-25.csv',
    });
    // The object URL is released once the browser has the file.
    await vi.waitFor(() => {
      expect(ObjectUrls.revokeObjectURL).toHaveBeenCalledWith('blob:leads');
    });
  });

  it('throws the problem of a refused export', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json(
            {
              type: 'about:blank',
              title: 'Chỉ Chủ sở hữu và Quản trị được thực hiện thao tác này',
              status: 403,
              code: 'forbidden',
            },
            { status: 403, headers: { 'Content-Type': 'application/problem+json' } },
          ),
        ),
      ),
    );
    await expect(
      downloadFile(
        endpoints.exportLeadPerson,
        ['64b000000000000000000001', '64b000000000000000000401'],
        {
          body: { format: 'json' },
        },
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
