import { endpoints } from '@plp/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, attachmentFilename, downloadFile } from './api';

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
              title: 'Chỉ Owner của workspace được thực hiện thao tác này',
              status: 403,
              code: 'forbidden',
            },
            { status: 403, headers: { 'Content-Type': 'application/problem+json' } },
          ),
        ),
      ),
    );
    await expect(
      downloadFile(endpoints.exportLeadPerson, ['64b000000000000000000401'], {
        body: { format: 'json' },
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
