import { QueryClientProvider, useInfiniteQuery } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { fetchNextPageAfterRead } from './fetch-next-page';
import { createTestQueryClient } from './test-utils';

/** A list of one row per page, read from `rows`; each read waits for `hold`. */
function renderList() {
  const server = { rows: ['a', 'b', 'c'], hold: Promise.resolve(), reads: 0 };
  const queryClient = createTestQueryClient();
  function Providers({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  const { result } = renderHook(
    () =>
      useInfiniteQuery({
        queryKey: ['rows'],
        queryFn: async ({ pageParam }) => {
          server.reads += 1;
          await server.hold;
          return {
            row: server.rows[pageParam],
            next: pageParam + 1 < server.rows.length ? pageParam + 1 : null,
          };
        },
        initialPageParam: 0,
        getNextPageParam: (page) => page.next,
        // The test reads the flags between renders: every change renders the hook again.
        notifyOnChangeProps: 'all',
      }),
    { wrapper: Providers },
  );
  return { server, queryClient, result };
}

function holdReads(server: { hold: Promise<void> }): () => void {
  let release: () => void = () => undefined;
  server.hold = new Promise((resolve) => {
    release = resolve;
  });
  return release;
}

describe('fetchNextPageAfterRead', () => {
  it('lets a read of the whole list end, then adds the next page to what it read', async () => {
    const { server, queryClient, result } = renderList();
    await waitFor(() => {
      expect(result.current.data?.pages).toHaveLength(1);
    });

    // "a" is deleted: the list reads itself again, slowly, as "Xem thêm" is pressed.
    server.rows = ['b', 'c'];
    const release = holdReads(server);
    void queryClient.invalidateQueries({ queryKey: ['rows'] });
    await waitFor(() => {
      expect(result.current.isFetching).toBe(true);
    });
    const more = fetchNextPageAfterRead(result.current);
    release();
    await act(() => more);

    await waitFor(() => {
      expect(result.current.data?.pages.map((page) => page.row)).toEqual(['b', 'c']);
    });
  });

  it('loads the next page once for a second click while it loads', async () => {
    const { server, result } = renderList();
    await waitFor(() => {
      expect(result.current.data?.pages).toHaveLength(1);
    });

    const release = holdReads(server);
    const first = fetchNextPageAfterRead(result.current);
    await waitFor(() => {
      expect(result.current.isFetchingNextPage).toBe(true);
    });
    const second = fetchNextPageAfterRead(result.current);
    release();
    await act(() => Promise.all([first, second]));

    await waitFor(() => {
      expect(result.current.data?.pages.map((page) => page.row)).toEqual(['a', 'b']);
    });
    expect(server.reads).toBe(2);
  });
});
