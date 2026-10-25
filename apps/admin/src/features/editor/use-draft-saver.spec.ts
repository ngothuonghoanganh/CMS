import type { ErrorCode, SaveDraftRequest, SaveDraftResponse } from '@plp/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { ApiError, api } from '../../lib/api';
import type * as ApiModule from '../../lib/api';
import { siteQueryKeys } from '../dashboard/queries';
import { pageQueryKeys } from '../history/queries';
import { createTestQueryClient } from '../shell/test-utils';
import { emptyChecks, makeStore, PAGE_ID, pageSummary, SITE_ID } from './test-fixtures';
import {
  createDraftSaver,
  DraftConflictError,
  runningSavesSettled,
  useDraftSaver,
} from './use-draft-saver';

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return { ...actual, api: vi.fn() };
});

type SaveCall = (
  endpoint: unknown,
  args: readonly string[],
  options: { body: SaveDraftRequest },
) => Promise<SaveDraftResponse>;

const saveMock = vi.mocked(api) as unknown as Mock<SaveCall>;

const HERO = 'hero00000001';

function response(revision: number): SaveDraftResponse {
  return {
    revision,
    updatedAt: `2026-10-24T09:00:0${String(revision % 10)}.000Z`,
    page: pageSummary(),
    checks: { ...emptyChecks, revision },
  };
}

function problem(status: number, code: ErrorCode, extra: Partial<ApiError['problem']> = {}) {
  return new ApiError(status, { type: 'about:blank', title: 'Lỗi', status, code, ...extra });
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup() {
  const store = makeStore();
  const saver = createDraftSaver(store);
  const stop = saver.start();
  return { store, saver, stop };
}

beforeEach(() => {
  vi.useFakeTimers();
  saveMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('draft saver', () => {
  it('saves 1.5 s after the last command, with the base revision', async () => {
    const { store, stop } = setup();
    saveMock.mockResolvedValue(response(4));
    store.getState().setSpacing(HERO, 'compact');
    await vi.advanceTimersByTimeAsync(1000);
    store.getState().setSpacing(HERO, 'spacious');
    await vi.advanceTimersByTimeAsync(1000);
    expect(saveMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(saveMock).toHaveBeenCalledTimes(1);
    const [, args, options] = saveMock.mock.calls[0] ?? [];
    expect(args).toEqual(['64b000000000000000000002']);
    expect(options?.body.baseRevision).toBe(3);
    expect(options?.body.composition.sections[1]?.spacing).toBe('spacious');
    expect(store.getState()).toMatchObject({ saveState: 'saved', baseRevision: 4 });
    stop();
  });

  it('keeps one request in flight and saves changes made meanwhile right after', async () => {
    const { store, stop } = setup();
    const first = deferred<SaveDraftResponse>();
    saveMock.mockReturnValueOnce(first.promise).mockResolvedValueOnce(response(5));
    store.getState().setSpacing(HERO, 'compact');
    await vi.advanceTimersByTimeAsync(1500);
    expect(store.getState().saveState).toBe('saving');

    store.getState().setSpacing(HERO, 'spacious');
    await vi.advanceTimersByTimeAsync(3000);
    expect(saveMock).toHaveBeenCalledTimes(1);

    first.resolve(response(4));
    await vi.advanceTimersByTimeAsync(0);
    expect(saveMock).toHaveBeenCalledTimes(2);
    expect(saveMock.mock.calls[1]?.[2].body.baseRevision).toBe(4);
    expect(saveMock.mock.calls[1]?.[2].body.composition.sections[1]?.spacing).toBe('spacious');
    expect(store.getState()).toMatchObject({ saveState: 'saved', baseRevision: 5 });

    await vi.advanceTimersByTimeAsync(5000);
    expect(saveMock).toHaveBeenCalledTimes(2);
    stop();
  });

  it('stops on a revision conflict and never saves over the newer draft', async () => {
    const { store, saver, stop } = setup();
    saveMock.mockRejectedValue(problem(409, 'revision_conflict'));
    store.getState().setSpacing(HERO, 'compact');
    await vi.advanceTimersByTimeAsync(1500);
    expect(store.getState().saveState).toBe('conflict');

    store.getState().setSpacing(HERO, 'spacious');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(saveMock).toHaveBeenCalledTimes(1);
    await expect(saver.ensureSaved()).rejects.toBeInstanceOf(DraftConflictError);
    stop();
  });

  it('retries network failures after 2 s, 5 s and 10 s, then waits for "Thử lại"', async () => {
    const { store, saver, stop } = setup();
    saveMock.mockRejectedValue(new TypeError('Failed to fetch'));
    store.getState().setSpacing(HERO, 'compact');
    await vi.advanceTimersByTimeAsync(1500);
    expect(store.getState()).toMatchObject({
      saveState: 'error',
      saveError: { kind: 'retryable', message: 'Không kết nối được máy chủ' },
    });
    expect(saveMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1999);
    expect(saveMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(saveMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5000);
    expect(saveMock).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(saveMock).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(saveMock).toHaveBeenCalledTimes(4);

    saveMock.mockResolvedValue(response(4));
    saver.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(saveMock).toHaveBeenCalledTimes(5);
    expect(store.getState()).toMatchObject({ saveState: 'saved', saveError: null });
    stop();
  });

  it('retries server errors but not rejected drafts, and shows the first issue', async () => {
    const { store, stop } = setup();
    saveMock.mockRejectedValueOnce(problem(503, 'internal')).mockRejectedValueOnce(
      problem(422, 'validation_failed', {
        issues: [
          { path: ['slug'], code: 'custom', message: 'Đường dẫn này được hệ thống giữ lại' },
        ],
      }),
    );
    store.getState().setSpacing(HERO, 'compact');
    await vi.advanceTimersByTimeAsync(1500);
    expect(store.getState().saveError?.kind).toBe('retryable');
    await vi.advanceTimersByTimeAsync(2000);
    expect(saveMock).toHaveBeenCalledTimes(2);
    expect(store.getState().saveError).toEqual({
      kind: 'invalid',
      message: 'Đường dẫn này được hệ thống giữ lại',
    });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(saveMock).toHaveBeenCalledTimes(2);
    stop();
  });

  it('ensureSaved saves immediately and resolves with the server result', async () => {
    const { store, saver, stop } = setup();
    saveMock.mockResolvedValue(response(4));
    store.getState().setSpacing(HERO, 'compact');
    const result = await saver.ensureSaved();
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(result.revision).toBe(4);
    await vi.advanceTimersByTimeAsync(5000);
    expect(saveMock).toHaveBeenCalledTimes(1);
    stop();
  });

  it('ensureSaved waits for the request in flight and the changes made after it', async () => {
    const { store, saver, stop } = setup();
    const first = deferred<SaveDraftResponse>();
    saveMock.mockReturnValueOnce(first.promise).mockResolvedValueOnce(response(5));
    store.getState().setSpacing(HERO, 'compact');
    await vi.advanceTimersByTimeAsync(1500);
    store.getState().setSpacing(HERO, 'spacious');
    const pending = saver.ensureSaved();
    first.resolve(response(4));
    await expect(pending).resolves.toMatchObject({ revision: 5 });
    expect(saveMock).toHaveBeenCalledTimes(2);
    stop();
  });

  it('ensureSaved without changes returns the current state without a request', async () => {
    const { saver, stop } = setup();
    await expect(saver.ensureSaved()).resolves.toMatchObject({ revision: 3 });
    expect(saveMock).not.toHaveBeenCalled();
    stop();
  });

  it('ensureSaved rejects with the failure so the caller can explain it', async () => {
    const { store, saver, stop } = setup();
    saveMock.mockRejectedValue(problem(403, 'forbidden', { title: 'Bạn không có quyền' }));
    store.getState().setSpacing(HERO, 'compact');
    await expect(saver.ensureSaved()).rejects.toBeInstanceOf(ApiError);
    expect(store.getState().saveError).toEqual({ kind: 'other', message: 'Bạn không có quyền' });
    stop();
  });

  it('does not save after it is stopped', async () => {
    const { store, stop } = setup();
    stop();
    store.getState().setSpacing(HERO, 'compact');
    await vi.advanceTimersByTimeAsync(5000);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('saves pending changes at once when stopped, instead of dropping them with the debounce', async () => {
    const { store, stop } = setup();
    saveMock.mockResolvedValue(response(4));
    store.getState().setSpacing(HERO, 'compact');
    stop();
    await vi.advanceTimersByTimeAsync(0);
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock.mock.calls[0]?.[2].body.composition.sections[1]?.spacing).toBe('compact');
    expect(store.getState().saveState).toBe('saved');
  });

  it('tries a failing save once more when stopped, then schedules no retries', async () => {
    const { store, stop } = setup();
    saveMock.mockRejectedValue(new TypeError('Failed to fetch'));
    store.getState().setSpacing(HERO, 'compact');
    await vi.advanceTimersByTimeAsync(1500);
    expect(store.getState().saveState).toBe('error');
    stop();
    await vi.advanceTimersByTimeAsync(0);
    expect(saveMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(saveMock).toHaveBeenCalledTimes(2);
  });

  it('drops changes the user chose to discard, also when stopped', async () => {
    const { store, saver, stop } = setup();
    saveMock.mockResolvedValue(response(4));
    store.getState().setSpacing(HERO, 'compact');
    saver.discard();
    await vi.advanceTimersByTimeAsync(5000);
    stop();
    await vi.advanceTimersByTimeAsync(0);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('saves again after a discard once there is a new change', async () => {
    const { store, saver, stop } = setup();
    saveMock.mockResolvedValue(response(4));
    store.getState().setSpacing(HERO, 'compact');
    saver.discard();
    store.getState().setSpacing(HERO, 'spacious');
    await vi.advanceTimersByTimeAsync(1500);
    expect(saveMock).toHaveBeenCalledTimes(1);
    stop();
  });

  it('does not save over a conflict when stopped', async () => {
    const { store, stop } = setup();
    saveMock.mockRejectedValue(problem(409, 'revision_conflict'));
    store.getState().setSpacing(HERO, 'compact');
    await vi.advanceTimersByTimeAsync(1500);
    store.getState().setSpacing(HERO, 'spacious');
    stop();
    await vi.advanceTimersByTimeAsync(0);
    expect(saveMock).toHaveBeenCalledTimes(1);
  });
});

describe('runningSavesSettled', () => {
  it('waits for every save of the page from any screen, and also ends when one fails', async () => {
    const seo = setup();
    const editor = setup();
    const seoSave = deferred<SaveDraftResponse>();
    const editorSave = deferred<SaveDraftResponse>();
    saveMock.mockReturnValueOnce(seoSave.promise).mockReturnValueOnce(editorSave.promise);
    // "SEO & chia sẻ": its autosave is on its way when Back stops the saver.
    seo.store.getState().updateSeo({ title: 'Niềng răng trong suốt' });
    await vi.advanceTimersByTimeAsync(1500);
    seo.stop();
    editor.store.getState().setSpacing(HERO, 'compact');
    const editorSaved = editor.saver.ensureSaved();

    const settled = vi.fn();
    void runningSavesSettled(PAGE_ID).then(settled);
    editorSave.resolve(response(4));
    await expect(editorSaved).resolves.toMatchObject({ revision: 4 });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).not.toHaveBeenCalled();

    seoSave.reject(problem(409, 'revision_conflict'));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toHaveBeenCalledTimes(1);
    editor.stop();
  });

  it('also waits for a save that started after one that ends first', async () => {
    const editor = setup();
    const seo = setup();
    const editorSave = deferred<SaveDraftResponse>();
    const seoSave = deferred<SaveDraftResponse>();
    saveMock.mockReturnValueOnce(editorSave.promise).mockReturnValueOnce(seoSave.promise);
    editor.store.getState().setSpacing(HERO, 'compact');
    const editorSaved = editor.saver.ensureSaved();
    seo.store.getState().updateSeo({ title: 'Niềng răng trong suốt' });
    const seoSaved = seo.saver.ensureSaved();

    const settled = vi.fn();
    void runningSavesSettled(PAGE_ID).then(settled);
    editorSave.resolve(response(4));
    await expect(editorSaved).resolves.toMatchObject({ revision: 4 });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).not.toHaveBeenCalled();

    seoSave.resolve(response(5));
    await expect(seoSaved).resolves.toMatchObject({ revision: 5 });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toHaveBeenCalledTimes(1);
    editor.stop();
    seo.stop();
  });
});

describe('useDraftSaver', () => {
  it('marks the page lists and the page screens stale after a save, without reading them', async () => {
    const store = makeStore();
    const queryClient = createTestQueryClient();
    const list = siteQueryKeys.pageList(SITE_ID, { status: null, q: '' });
    const summary = pageQueryKeys.summary(SITE_ID, PAGE_ID);
    const otherPage = pageQueryKeys.summary(SITE_ID, '64b0000000000000000000ff');
    const linkTargets = [...siteQueryKeys.pages(SITE_ID), 'link-targets'];
    for (const key of [list, summary, otherPage, linkTargets]) {
      queryClient.setQueryData(key, { cached: true });
    }
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const { result, unmount } = renderHook(() => useDraftSaver(store), { wrapper });

    saveMock.mockRejectedValueOnce(problem(503, 'internal'));
    store.getState().setSpacing(HERO, 'compact');
    await act(() => expect(result.current.ensureSaved()).rejects.toThrow());
    expect(queryClient.getQueryState(list)?.isInvalidated).toBe(false);

    saveMock.mockResolvedValueOnce(response(4));
    await act(() => result.current.ensureSaved());
    expect(queryClient.getQueryState(list)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(summary)?.isInvalidated).toBe(true);
    // The editor's own link targets and other pages are left alone.
    expect(queryClient.getQueryState(linkTargets)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(otherPage)?.isInvalidated).toBe(false);
    // Nothing read now: only the two saves went out.
    expect(saveMock).toHaveBeenCalledTimes(2);
    unmount();
  });
});
