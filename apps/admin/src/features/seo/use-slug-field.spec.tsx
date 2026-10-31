import type { SlugAvailability } from '@plp/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { type EditorStore, EditorStoreProvider, useEditor } from '../editor';
import { makeStore, PAGE_ID, pageDetail, SITE_ID } from '../editor/test-fixtures';
import { createTestQueryClient } from '../shell/test-utils';
import { SlugNotCommittedError, useSlugField } from './use-slug-field';

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

describe('useSlugField when the user leaves', () => {
  function answer(available: boolean) {
    apiMock.mockImplementation(() =>
      Promise.resolve({
        slug: 'moi',
        available,
        reason: available ? null : 'taken',
        message: available ? null : 'Đường dẫn này đang được trang “Bảng giá” dùng',
      }),
    );
  }

  it('reports a slug typed but not in the draft as pending', async () => {
    answer(true);
    const store = makeStore();
    const { result } = renderSlugField(store, 0);
    expect(result.current.isPending()).toBe(false);

    act(() => {
      result.current.change('moi');
    });
    // The typing is known before React renders again.
    expect(result.current.isPending()).toBe(true);
    await waitFor(() => {
      expect(store.getState().draft.slug).toBe('moi');
    });
    expect(result.current.isPending()).toBe(false);
  });

  it('checks the slug at once, without waiting for the typing pause, and commits it', async () => {
    vi.useFakeTimers();
    answer(true);
    const store = makeStore();
    const { result } = renderSlugField(store, 400);
    act(() => {
      result.current.change('moi');
    });

    await act(async () => {
      await result.current.commit();
    });

    expect(store.getState().draft.slug).toBe('moi');
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(result.current.isPending()).toBe(false);
  });

  it('finishes a slug still being typed before checking it', async () => {
    answer(true);
    const store = makeStore();
    const { result } = renderSlugField(store, 0);
    act(() => {
      result.current.change('moi-');
    });

    await act(async () => {
      await result.current.commit();
    });

    expect(store.getState().draft.slug).toBe('moi');
    expect(result.current.text).toBe('moi');
  });

  it('waits for the check already on its way instead of sending another', async () => {
    const answerAvailable = heldCheck();
    const store = makeStore();
    const { result } = renderSlugField(store, 0);
    act(() => {
      result.current.change('moi');
    });
    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledTimes(1);
    });

    let committed = false;
    const leaving = result.current.commit().then(() => {
      committed = true;
    });
    await Promise.resolve();
    expect(committed).toBe(false);
    answerAvailable('moi');
    await act(() => leaving);

    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(store.getState().draft.slug).toBe('moi');
  });

  it('refuses a slug another page uses, keeping it out of the draft', async () => {
    answer(false);
    const store = makeStore();
    const { result } = renderSlugField(store, 400);
    act(() => {
      result.current.change('moi');
    });

    await act(async () => {
      const leaving = result.current.commit();
      await expect(leaving).rejects.toThrow(SlugNotCommittedError);
      await expect(leaving).rejects.toThrow('Đường dẫn này đang được trang “Bảng giá” dùng');
    });

    expect(store.getState().draft.slug).toBe('uu-dai-thang-11');
    expect(result.current.isPending()).toBe(true);
  });

  it('refuses a slug with a format problem without asking the server', async () => {
    const store = makeStore();
    const { result } = renderSlugField(store, 0);
    act(() => {
      result.current.change('api');
    });

    await act(async () => {
      await expect(result.current.commit()).rejects.toThrow('Đường dẫn này được hệ thống giữ lại');
    });
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('keeps the slug out of the draft when the check cannot reach the server', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    apiMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const store = makeStore();
    const { result } = renderSlugField(store, 400);
    act(() => {
      result.current.change('moi');
    });

    await act(async () => {
      await expect(result.current.commit()).rejects.toThrow(
        'Không kết nối được máy chủ. Kiểm tra kết nối mạng rồi thử lại.',
      );
    });
    expect(store.getState().draft.slug).toBe('uu-dai-thang-11');
    expect(result.current.check.state).toBe('failed');
  });

  it('asks again after a failed check, and commits when the server answers', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    apiMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const store = makeStore();
    const { result } = renderSlugField(store, 0);
    act(() => {
      result.current.change('moi');
    });
    await waitFor(() => {
      expect(result.current.check.state).toBe('failed');
    });

    answer(true);
    await act(async () => {
      await result.current.commit();
    });

    expect(apiMock).toHaveBeenCalledTimes(2);
    expect(store.getState().draft.slug).toBe('moi');
  });

  it('checks what the user typed meanwhile, not the slug it was checking', async () => {
    let answerFirst: (result: SlugAvailability) => void = () => undefined;
    apiMock
      .mockReturnValueOnce(
        new Promise<SlugAvailability>((done) => {
          answerFirst = done;
        }),
      )
      .mockResolvedValue({ slug: 'moi-hon', available: true, reason: null, message: null });
    const store = makeStore();
    // The new typing would be checked only after the pause: leaving must check it itself.
    const { result } = renderSlugField(store, 400);
    act(() => {
      result.current.change('moi');
    });
    const leaving = result.current.commit();
    expect(apiMock).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.change('moi-hon');
    });
    answerFirst({ slug: 'moi', available: true, reason: null, message: null });
    await act(() => leaving);

    expect(store.getState().draft.slug).toBe('moi-hon');
  });

  it('has nothing to commit once the draft was replaced from the server', async () => {
    heldCheck();
    const store = makeStore();
    const { result } = renderSlugField(store, 0);
    act(() => {
      result.current.change('moi');
    });
    reloadFromServer(store, 'tren-may-chu');

    await act(async () => {
      await result.current.commit();
    });

    expect(result.current.isPending()).toBe(false);
    expect(store.getState().draft.slug).toBe('tren-may-chu');
  });
});
