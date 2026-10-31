'use client';

import { Button, Callout, Dialog } from '@plp/ui';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { setHistoryGuard } from '../shell/history-guard';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import type { Leave, LeaveOutcome } from '../shell/screen-leave';
import { type EditorStore, isDiscarded, type SaveState } from './store';
import { type DraftSaver, DraftConflictError } from './use-draft-saver';

/** States in which leaving would lose changes. */
export function isUnsaved(saveState: SaveState): boolean {
  return saveState === 'dirty' || saveState === 'saving' || saveState === 'error';
}

/**
 * A change a field holds before it reaches the store (a slug being checked); leaving would drop
 * it as surely as an unsaved draft. Pass a stable function.
 */
export type PendingInput = () => boolean;

/**
 * Whether leaving now drops changes the user has not given up ("Rời trang, bỏ thay đổi", for a
 * leave still under way).
 */
function leavingLoses(store: EditorStore, pendingInput: PendingInput | undefined): boolean {
  const state = store.getState();
  return !isDiscarded(state) && (isUnsaved(state.saveState) || pendingInput?.() === true);
}

/**
 * Asks the browser to confirm closing or reloading the tab while changes are unsaved. Not while the
 * user gives them up for a leave: they chose to leave, and a prompt would let them stay after a
 * full page load already began (the sidebar's workspace switch remembers the new workspace first).
 */
export function useBeforeUnloadGuard(store: EditorStore, pendingInput?: PendingInput): void {
  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (leavingLoses(store, pendingInput)) {
        event.preventDefault();
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [store, pendingInput]);
}

/** Where the user wanted to go: a link in the editor, or the browser's Back/Forward. */
type PendingLeave = { kind: 'link'; href: string } | { kind: 'history' };

/** The editor's own history entry, recorded while the editor is surely on it. */
interface HistoryEntry {
  state: unknown;
  url: string;
}

function currentEntry(): HistoryEntry {
  return { state: window.history.state as unknown, url: window.location.href };
}

/**
 * Whether going from `from` to `to` only moved within the page: same path and query, another
 * fragment. Browsers fire `popstate` for that too (a skip link to `#main-content`, Back to the
 * entry before it), and it leaves nothing, so it must not be taken for leaving the screen.
 */
export function isFragmentNavigation(from: string, to: string): boolean {
  const before = new URL(from);
  const after = new URL(to);
  return (
    before.origin === after.origin &&
    before.pathname === after.pathname &&
    before.search === after.search &&
    before.hash !== after.hash
  );
}

/**
 * Browser Back/Forward out of a screen that edits the draft (see `history-guard`). While changes
 * are unsaved the guard keeps the router from handling the event, puts the screen's entry back
 * (with the router's own state, so the router keeps working) and hands `onBlocked` the way to
 * leave after all: going back once more. The screen's entry was pushed right after the one the
 * user chose, so `history.back()` reaches it whichever direction they went.
 */
export function useHistoryLeaveGuard(
  store: EditorStore,
  onBlocked: (leave: Leave) => void,
  pendingInput?: PendingInput,
): () => LeaveOutcome {
  const allowNext = useRef(false);
  const leave = useCallback((): LeaveOutcome => {
    allowNext.current = true;
    window.history.back();
    return 'leaving';
  }, []);

  useEffect(() => {
    let entry = currentEntry();
    const unsubscribe = store.subscribe((state, previous) => {
      if (isUnsaved(state.saveState) && !isUnsaved(previous.saveState)) {
        entry = currentEntry();
      }
    });
    const removeGuard = setHistoryGuard(() => {
      if (allowNext.current) {
        allowNext.current = false;
        return false;
      }
      if (!leavingLoses(store, pendingInput)) {
        return false;
      }
      if (isFragmentNavigation(entry.url, window.location.href)) {
        return false;
      }
      window.history.pushState(entry.state, '', entry.url);
      onBlocked(leave);
      return true;
    });
    return () => {
      unsubscribe();
      removeGuard();
    };
  }, [store, onBlocked, leave, pendingInput]);

  return leave;
}

export interface LeaveGuard {
  /** Navigates now, or asks first when changes are unsaved. */
  navigate: (href: string) => void;
  /** The confirmation dialog; render it once. */
  dialog: ReactNode;
}

/**
 * Navigation out of the editor (back, history, SEO, and the browser's Back/Forward). With unsaved
 * changes the user can stay, save and leave, or leave without saving.
 */
export function useLeaveGuard(
  store: EditorStore,
  saver: Pick<DraftSaver, 'ensureSaved' | 'discardFor'>,
  push: (href: string) => void,
): LeaveGuard {
  const { ensureSaved, discardFor } = saver;
  const [pending, setPending] = useState<PendingLeave | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = useCallback((leave: PendingLeave) => {
    setError(null);
    setPending(leave);
  }, []);
  const askForHistory = useCallback(() => {
    ask({ kind: 'history' });
  }, [ask]);
  const goBackInHistory = useHistoryLeaveGuard(store, askForHistory);

  const navigate = useCallback(
    (href: string) => {
      if (isUnsaved(store.getState().saveState)) {
        ask({ kind: 'link', href });
        return;
      }
      push(href);
    },
    [store, push, ask],
  );

  function go(target: PendingLeave): LeaveOutcome {
    if (target.kind === 'history') {
      return goBackInHistory();
    }
    push(target.href);
    return 'leaving';
  }

  function leave(target: PendingLeave, saved: boolean) {
    setPending(null);
    if (saved) {
      go(target);
      return;
    }
    // Leaving unmounts the editor, which would otherwise save these changes on the way out.
    discardFor(() => go(target)).catch((error: unknown) => {
      reportUnexpected('Leaving the editor without saving failed', error);
    });
  }

  async function saveAndLeave(target: PendingLeave) {
    setSaving(true);
    setError(null);
    try {
      await ensureSaved();
      leave(target, true);
    } catch (caught) {
      if (caught instanceof DraftConflictError) {
        // The blocking conflict dialog takes over; nothing here can be saved any more.
        setPending(null);
      } else {
        reportUnexpected('Saving the draft before leaving the editor failed', caught);
        setError(`Chưa lưu được bản nháp. ${problemMessage(caught)}`);
      }
    } finally {
      setSaving(false);
    }
  }

  const dialog = (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open && !saving) {
          setPending(null);
        }
      }}
      title="Rời editor khi chưa lưu xong?"
      description="Một số thay đổi chưa được lưu vào bản nháp. Nếu rời trang mà không lưu, các thay đổi này sẽ mất."
      footer={
        <>
          <Button
            variant="secondary"
            disabled={saving}
            onClick={() => {
              setPending(null);
            }}
          >
            Ở lại
          </Button>
          <Button
            variant="danger"
            disabled={saving}
            onClick={() => {
              if (pending !== null) {
                leave(pending, false);
              }
            }}
          >
            Rời trang, bỏ thay đổi
          </Button>
          <Button
            loading={saving}
            onClick={() => {
              if (pending !== null) {
                void saveAndLeave(pending);
              }
            }}
          >
            Lưu rồi rời trang
          </Button>
        </>
      }
    >
      {error ? (
        <Callout tone="danger" role="alert">
          {error}
        </Callout>
      ) : null}
    </Dialog>
  );

  return { navigate, dialog };
}
