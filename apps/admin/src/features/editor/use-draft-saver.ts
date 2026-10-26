'use client';

import { endpoints, type SaveDraftResponse } from '@plp/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ApiError, api } from '../../lib/api';
import { markPageScreensStale } from './stale-screens';
import {
  currentSaveResponse,
  type EditorStore,
  hasUnsavedChanges,
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

export interface DraftSaver {
  /** Saves pending changes now (e.g. before publishing) and resolves with the server result. */
  ensureSaved: () => Promise<SaveDraftResponse>;
  /** "Thử lại": saves now and restarts the automatic retries. */
  retry: () => void;
  /**
   * "Rời trang, bỏ thay đổi": drops the pending save, and stopping will not save these changes.
   * A later change is saved as usual again.
   */
  discard: () => void;
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

function isKnownSaveFailure(error: unknown): boolean {
  return (
    error instanceof ApiError || error instanceof DraftConflictError || error instanceof TypeError
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
  let discarded = false;

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
      if (failure.kind === 'retryable') {
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

  return {
    ensureSaved: flush,
    retry() {
      retryAttempt = 0;
      flushInBackground();
    },
    discard() {
      discarded = true;
      clearTimers();
    },
    start() {
      stopped = false;
      const unsubscribe = store.subscribe((state, previous) => {
        if (state.draftVersion !== previous.draftVersion) {
          discarded = false;
        }
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
        if (!discarded && hasUnsavedChanges(state) && state.saveState !== 'conflict') {
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
): Pick<DraftSaver, 'ensureSaved' | 'retry' | 'discard'> {
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
