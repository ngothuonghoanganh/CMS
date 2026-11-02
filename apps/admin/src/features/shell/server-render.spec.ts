import { describe, expect, it } from 'vitest';
import { adoptServerRender, adoptServerRenderKeepingPages, serverFirstPage } from './server-render';
import { createTestQueryClient } from './test-utils';

const KEY = ['sites', 'site-1', 'pages', 'list', 'all', ''];
const LOADED_AT = Date.parse('2026-10-24T12:00:00.000Z');

describe('adoptServerRender', () => {
  it('fills an empty key, dated by the server render', () => {
    const queryClient = createTestQueryClient();
    adoptServerRender(queryClient, KEY, { pages: ['server'] }, LOADED_AT);
    expect(queryClient.getQueryData(KEY)).toEqual({ pages: ['server'] });
    expect(queryClient.getQueryState(KEY)?.dataUpdatedAt).toBe(LOADED_AT);
  });

  it('replaces data cached before the server loaded its own', () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(KEY, { pages: ['cached'] }, { updatedAt: LOADED_AT - 5_000 });
    adoptServerRender(queryClient, KEY, { pages: ['server'] }, LOADED_AT);
    expect(queryClient.getQueryData(KEY)).toEqual({ pages: ['server'] });
    expect(queryClient.getQueryState(KEY)?.dataUpdatedAt).toBe(LOADED_AT);
  });

  it('keeps data read after the server loaded its own, or at the same time', () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(KEY, { pages: ['newer'] }, { updatedAt: LOADED_AT + 5_000 });
    adoptServerRender(queryClient, KEY, { pages: ['server'] }, LOADED_AT);
    expect(queryClient.getQueryData(KEY)).toEqual({ pages: ['newer'] });

    queryClient.setQueryData(KEY, { pages: ['same time'] }, { updatedAt: LOADED_AT });
    adoptServerRender(queryClient, KEY, { pages: ['server'] }, LOADED_AT);
    expect(queryClient.getQueryData(KEY)).toEqual({ pages: ['same time'] });
  });
});

describe('serverFirstPage', () => {
  it('holds the first page only, as a list starts before "Xem thêm"', () => {
    expect(serverFirstPage({ items: ['a'], nextCursor: 'c1' })).toEqual({
      pages: [{ items: ['a'], nextCursor: 'c1' }],
      pageParams: [null],
    });
  });
});

describe('adoptServerRenderKeepingPages', () => {
  const first = { items: ['a'], nextCursor: 'c1' };
  const second = { items: ['b'], nextCursor: null };

  it('takes the server’s first page over a list of one page cached before it', () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(KEY, serverFirstPage({ items: ['old'], nextCursor: 'c1' }), {
      updatedAt: LOADED_AT - 5_000,
    });
    adoptServerRenderKeepingPages(queryClient, KEY, first, LOADED_AT);
    expect(queryClient.getQueryData(KEY)).toEqual(serverFirstPage(first));
    expect(queryClient.getQueryState(KEY)?.dataUpdatedAt).toBe(LOADED_AT);
  });

  it('keeps the pages loaded with "Xem thêm", and has them read again', () => {
    const queryClient = createTestQueryClient();
    const loaded = { pages: [first, second], pageParams: [null, 'c1'] };
    queryClient.setQueryData(KEY, loaded, { updatedAt: LOADED_AT - 5_000 });
    adoptServerRenderKeepingPages(
      queryClient,
      KEY,
      { items: ['server'], nextCursor: 'c1' },
      LOADED_AT,
    );
    expect(queryClient.getQueryData(KEY)).toEqual(loaded);
    expect(queryClient.getQueryState(KEY)?.isInvalidated).toBe(true);
  });

  it('keeps a list read after the server loaded its own', () => {
    const queryClient = createTestQueryClient();
    const loaded = { pages: [first, second], pageParams: [null, 'c1'] };
    queryClient.setQueryData(KEY, loaded, { updatedAt: LOADED_AT + 5_000 });
    adoptServerRenderKeepingPages(
      queryClient,
      KEY,
      { items: ['server'], nextCursor: 'c1' },
      LOADED_AT,
    );
    expect(queryClient.getQueryData(KEY)).toEqual(loaded);
    expect(queryClient.getQueryState(KEY)?.isInvalidated).toBe(false);
  });
});
