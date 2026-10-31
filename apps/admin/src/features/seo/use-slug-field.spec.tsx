import type { SlugAvailability } from '@plp/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { type EditorStore, EditorStoreProvider, useEditor } from '../editor';
import { makeStore, PAGE_ID, pageDetail, SITE_ID } from '../editor/test-fixtures';
import { createTestQueryClient } from '../shell/test-utils';
import { useSlugField } from './use-slug-field';

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

/** The slug field wired to the draft as the SEO form wires it. */
function renderSlugField(store: EditorStore, delayMs: number) {
  const queryClient = createTestQueryClient();
  return renderHook(
    () => {
      const committed = useEditor((state) => state.draft.slug);
      return useSlugField({
        siteId: SITE_ID,
        pageId: PAGE_ID,
        committed,
        onCommit: (slug) => {
          store.getState().setSlug(slug, { merge: true });
        },
        onDone: () => {
          store.getState().closeHistoryStep();
        },
        delayMs,
      });
    },
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <EditorStoreProvider store={store}>{children}</EditorStoreProvider>
        </QueryClientProvider>
      ),
    },
  );
}

/** Answers the next availability check when the test says so. */
function heldCheck() {
  let answer: (result: SlugAvailability) => void = () => undefined;
  apiMock.mockReturnValue(
    new Promise<SlugAvailability>((done) => {
      answer = done;
    }),
  );
  return (slug: string) => {
    answer({ slug, available: true, reason: null, message: null });
  };
}

/** "Tải lại bản mới nhất" after a conflict: another tab saved the draft with this slug. */
function reloadFromServer(store: EditorStore, slug: string) {
  const detail = pageDetail();
  detail.draft = { ...detail.draft, slug, revision: 4 };
  act(() => {
    store.getState().replaceDraftFromServer(detail, []);
  });
}

beforeEach(() => {
  apiMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useSlugField when the draft is replaced from the server', () => {
  it('shows the new slug instead of the one it committed, without that check', async () => {
    const answerAvailable = heldCheck();
    const store = makeStore();
    const { result } = renderSlugField(store, 0);

    act(() => {
      result.current.change('moi');
    });
    // Tab out before the check answers: the typed text stays in the field after the commit.
    act(() => {
      result.current.blur();
    });
    answerAvailable('moi');
    await waitFor(() => {
      expect(result.current.check).toEqual({ state: 'available' });
    });
    expect(store.getState().draft.slug).toBe('moi');

    reloadFromServer(store, 'tren-may-chu');
    expect(result.current.text).toBe('tren-may-chu');
    expect(result.current.check).toEqual({ state: 'idle' });
  });

  it('ignores the answer of a check still on its way, so the new draft keeps its slug', async () => {
    const answerAvailable = heldCheck();
    const store = makeStore();
    const { result } = renderSlugField(store, 0);

    act(() => {
      result.current.change('moi');
    });
    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledTimes(1);
    });
    reloadFromServer(store, 'tren-may-chu');
    answerAvailable('moi');
    // Let the hook handle the answer before looking at the draft.
    await act(async () => {
      await new Promise((done) => {
        setTimeout(done, 0);
      });
    });

    expect(store.getState().draft.slug).toBe('tren-may-chu');
    expect(store.getState().saveState).toBe('saved');
    expect(result.current.text).toBe('tren-may-chu');
    expect(result.current.check).toEqual({ state: 'idle' });
  });

  it('cancels a check it has not sent yet', async () => {
    vi.useFakeTimers();
    apiMock.mockResolvedValue({ slug: 'moi', available: true, reason: null, message: null });
    const store = makeStore();
    const { result } = renderSlugField(store, 400);

    act(() => {
      result.current.change('moi');
    });
    reloadFromServer(store, 'tren-may-chu');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(apiMock).not.toHaveBeenCalled();
    expect(store.getState().draft.slug).toBe('tren-may-chu');
    expect(result.current.text).toBe('tren-may-chu');
  });
});
