'use client';

import { endpoints, type SaveDraftResponse } from '@plp/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ApiError, api } from '../../lib/api';
import type { Leave, LeaveOutcome } from '../shell/screen-leave';
import { markPageScreensStale } from './stale-screens';
import {
  currentSaveResponse,
  type EditorState,
  type EditorStore,
  hasUnsavedChanges,
  isDiscarded,
  type SaveFailure,
} from './store';

/** Debounce after the last command (ADR-008). */
export const AUTOSAVE_DELAY_MS = 1500;
/** Automatic retries after a network or server error; afterwards only "Thử lại" retries. */
export const RETRY_DELAYS_MS: readonly number[] = [2000, 5000, 10_000];

/** The draft changed on the server since it was loaded; the user must reload it. */
export class DraftConflictError extends Error {
  constructor() {
    super('Trang vừa được cập nhật ở nơi khác');
    this.name = 'DraftConflictError';
  }
}

/**
 * The changes not saved yet were given up for a leave ("Rời trang, bỏ thay đổi"): nothing saved
 * them, and whoever asked for the save must not act as if it had. Another leave goes without them,
 * as the user chose; anything else that needed them saved (publish, preview, "Quay về bản live")
 * does nothing. They count again when the leave does not happen.
 */
export class ChangesDiscardedError extends Error {
  constructor() {
    super('Thay đổi chưa lưu đã được bỏ cho lần rời trang đang diễn ra');
    this.name = 'ChangesDiscardedError';
  }
}

export interface DraftSaver {
  /**
   * Saves pending changes now (e.g. before publishing) and resolves with the server result.
   * Rejects with `ChangesDiscardedError` while they are given up for a leave.
   */
  ensureSaved: () => Promise<SaveDraftResponse>;
  /** "Thử lại": saves now and restarts the automatic retries. Nothing while changes are given up. */
  retry: () => void;
  /**
   * "Rời trang, bỏ thay đổi": gives the changes not saved yet up for `leave`, then leaves. No save
   * of them starts any more, not even a retry or the one on stopping; a request already sent cannot
   * be recalled. When the user stays after all, this leave takes them back: once no other leave
   * they were given up for is under way, they count as unsaved again and autosave resumes. A later
   * change is saved as usual. Resolves with the leave's outcome.
   */
  discardFor: (leave: Leave) => Promise<LeaveOutcome>;
  /**
   * Starts listening to the store; returns the function that stops it. Stopping (the screen
   * unmounts: a link, Back/Forward) saves pending changes right away instead of dropping them, but
   * schedules no more retries.
   */
  start: () => () => void;
}

export interface DraftSaverOptions {
  debounceMs?: number;
  retryDelaysMs?: readonly number[];
  /** Called after each save the server accepted. */
  onSaved?: () => void;
}

function firstIssueMessage(error: ApiError): string {
  return error.problem.issues?.[0]?.message ?? error.problem.detail ?? error.problem.title;
}

/** Classifies a failed save; the store shows the message next to the save indicator. */
export function describeSaveFailure(error: unknown): SaveFailure | 'conflict' {
  if (error instanceof ApiError) {
    if (error.status === 409 && error.code === 'revision_conflict') {
      return 'conflict';
    }
    if (error.status === 422) {
      return { kind: 'invalid', message: firstIssueMessage(error) };
    }
    if (error.status >= 500) {
      return { kind: 'retryable', message: error.problem.title };
    }
    return { kind: 'other', message: error.problem.detail ?? error.problem.title };
  }
  if (error instanceof TypeError) {
    // fetch() rejects with a TypeError when the network is unreachable.
    return { kind: 'retryable', message: 'Không kết nối được máy chủ' };
  }
  return { kind: 'other', message: 'Lưu bản nháp không thành công' };
}

/** Changes to save: some not saved yet, and not given up for a leave. */
function needsSave(state: EditorState): boolean {
  return hasUnsavedChanges(state) && !isDiscarded(state);
}

function isKnownSaveFailure(error: unknown): boolean {
  return (
    error instanceof ApiError ||
    error instanceof DraftConflictError ||
    error instanceof ChangesDiscardedError ||
    error instanceof TypeError
  );
}

/**
 * Saves running in this tab, per page. A screen that unmounts saves its pending changes in the
 * background (Back from "SEO & chia sẻ" to the editor), while the next screen of the page reads it
 * once on mount (ADR-008): a read that overtook such a save would keep a base revision the next
 * save conflicts with.
 */
const runningSaves = new Map<string, Promise<void>>();

function trackRunningSave(pageId: string, save: Promise<unknown>): void {
  const ended: Promise<void> = Promise.allSettled([runningSaves.get(pageId), save]).then(() => {
    if (runningSaves.get(pageId) === ended) {
      runningSaves.delete(pageId);
    }
  });
  runningSaves.set(pageId, ended);
}

/** Resolves once the saves of the page running now have ended, whether they succeeded or not. */
export function runningSavesSettled(pageId: string): Promise<void> {
  return runningSaves.get(pageId) ?? Promise.resolve();
}

/**
 * Autosave for one editor store: debounced PUTs with the base revision, one request in flight,
 * changes made meanwhile saved right after, conflicts surfaced and never merged.
 */
export function createDraftSaver(store: EditorStore, options: DraftSaverOptions = {}): DraftSaver {
  const debounceMs = options.debounceMs ?? AUTOSAVE_DELAY_MS;
  const retryDelays = options.retryDelaysMs ?? RETRY_DELAYS_MS;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryAttempt = 0;
  let running: Promise<SaveDraftResponse> | null = null;
  let stopped = true;

  function clearTimers() {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  function scheduleRetry() {
    const delay = retryDelays[retryAttempt];
    if (delay === undefined || stopped) {
      return;
    }
    retryAttempt += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      flushInBackground();
    }, delay);
  }

  async function saveOnce(): Promise<void> {
    const state = store.getState();
    const version = state.draftVersion;
    const { slug, composition, seo } = state.draft;
    state.markSaving();
    let response: SaveDraftResponse;
    try {
      response = await api(endpoints.saveDraft, [state.page.id], {
        body: { baseRevision: state.baseRevision, slug, composition, seo },
      });
    } catch (error) {
      const failure = describeSaveFailure(error);
      if (failure === 'conflict') {
        store.getState().markConflict();
        throw new DraftConflictError();
      }
      store.getState().markSaveFailed(failure);
      // Changes given up while this request was out are not tried again.
      if (failure.kind === 'retryable' && !isDiscarded(store.getState())) {
        scheduleRetry();
      }
      throw error;
    }
    retryAttempt = 0;
    store.getState().applySaved(response, version);
    options.onSaved?.();
  }

  async function saveUntilCurrent(): Promise<SaveDraftResponse> {
    for (;;) {
      const state = store.getState();
      if (state.saveState === 'conflict') {
        throw new DraftConflictError();
      }
      if (!hasUnsavedChanges(state)) {
        return currentSaveResponse(state);
      }
      if (isDiscarded(state)) {
        // The store's last saved state is not these changes: answering with it would let the
        // caller leave as if they were saved, while the leave they were given up for may stay.
        throw new ChangesDiscardedError();
      }
      await saveOnce();
    }
  }

  function flush(): Promise<SaveDraftResponse> {
    clearTimers();
    if (running === null) {
      running = saveUntilCurrent().finally(() => {
        running = null;
      });
      trackRunningSave(store.getState().page.id, running);
    }
    return running;
  }

  function flushInBackground() {
    flush().catch((error: unknown) => {
      // Known failures are already shown by the store (save indicator, conflict dialog). Anything
      // else is a programming error, also shown as "Chưa lưu được", and logged for developers.
      if (!isKnownSaveFailure(error)) {
        console.error('Autosave failed unexpectedly', error);
      }
    });
  }

  function scheduleSave() {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      flushInBackground();
    }, debounceMs);
  }

  /**
   * A leave the changes of `version` were given up for did not happen: they are saved again, unless
   * another leave they were given up for is still under way.
   */
  function keepUnsaved(version: number) {
    store.getState().withdrawDiscard(version);
    const state = store.getState();
    if (!stopped && needsSave(state) && state.saveState !== 'conflict') {
      scheduleSave();
    }
  }

  return {
    ensureSaved: flush,
    retry() {
      retryAttempt = 0;
      flushInBackground();
    },
    async discardFor(leave) {
      const version = store.getState().discardUnsaved();
      clearTimers();
      let outcome: LeaveOutcome;
      try {
        outcome = await leave();
      } catch (error) {
        keepUnsaved(version);
        throw error;
      }
      if (outcome === 'stayed') {
        keepUnsaved(version);
      }
      return outcome;
    },
    start() {
      stopped = false;
      const unsubscribe = store.subscribe((state, previous) => {
        if (
          state.draftVersion !== previous.draftVersion &&
          hasUnsavedChanges(state) &&
          state.saveState !== 'conflict'
        ) {
          scheduleSave();
        }
      });
      if (hasUnsavedChanges(store.getState())) {
        scheduleSave();
      }
      return () => {
        stopped = true;
        unsubscribe();
        clearTimers();
        const state = store.getState();
        if (needsSave(state) && state.saveState !== 'conflict') {
          flushInBackground();
        }
      };
    },
  };
}

/** Autosave bound to a component's lifetime. Used by the editor and the page SEO form. */
export function useDraftSaver(
  store: EditorStore,
  options?: DraftSaverOptions,
): Pick<DraftSaver, 'ensureSaved' | 'retry' | 'discardFor'> {
  const queryClient = useQueryClient();
  const [saver] = useState(() =>
    createDraftSaver(store, {
      ...options,
      // One on screen already is read at once: a save sent as its screen unmounted can land
      // after the next screen showed.
      onSaved: () => {
        options?.onSaved?.();
        const { site, page } = store.getState();
        markPageScreensStale(queryClient, site.id, page.id);
      },
    }),
  );
  useEffect(() => saver.start(), [saver]);
  return saver;
}
