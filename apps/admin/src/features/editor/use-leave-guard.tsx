'use client';

import type { SaveDraftResponse } from '@plp/contracts';
import { Button, Callout, Dialog } from '@plp/ui';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { setHistoryGuard } from '../shell/history-guard';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import type { EditorStore, SaveState } from './store';
import { DraftConflictError } from './use-draft-saver';

/** States in which leaving would lose changes. */
export function isUnsaved(saveState: SaveState): boolean {
  return saveState === 'dirty' || saveState === 'saving' || saveState === 'error';
}

/** Asks the browser to confirm closing or reloading the tab while changes are unsaved. */
export function useBeforeUnloadGuard(store: EditorStore): void {
  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (isUnsaved(store.getState().saveState)) {
        event.preventDefault();
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [store]);
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
 * Browser Back/Forward out of a screen that edits the draft (see `history-guard`). While changes
 * are unsaved the guard keeps the router from handling the event, puts the screen's entry back
 * (with the router's own state, so the router keeps working) and hands `onBlocked` the way to
 * leave after all: going back once more. The screen's entry was pushed right after the one the
 * user chose, so `history.back()` reaches it whichever direction they went.
 */
export function useHistoryLeaveGuard(
  store: EditorStore,
  onBlocked: (leave: () => void) => void,
): () => void {
  const allowNext = useRef(false);
  const leave = useCallback(() => {
    allowNext.current = true;
    window.history.back();
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
      if (!isUnsaved(store.getState().saveState)) {
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
  }, [store, onBlocked, leave]);

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
  saver: { ensureSaved: () => Promise<SaveDraftResponse>; discard: () => void },
  push: (href: string) => void,
): LeaveGuard {
  const { ensureSaved, discard } = saver;
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

  function leave(target: PendingLeave, saved: boolean) {
    setPending(null);
    if (!saved) {
      // Leaving unmounts the editor, which would otherwise save these changes on the way out.
      discard();
    }
    if (target.kind === 'link') {
      push(target.href);
    } else {
      goBackInHistory();
    }
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
