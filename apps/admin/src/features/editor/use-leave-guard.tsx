'use client';

import type { SaveDraftResponse } from '@plp/contracts';
import { Button, Callout, Dialog } from '@plp/ui';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../lib/api';
import type { EditorStore, SaveState } from './store';

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

function saveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.problem.detail ?? error.problem.title;
  }
  return 'Chưa lưu được bản nháp. Kiểm tra kết nối rồi thử lại.';
}

export interface LeaveGuard {
  /** Navigates now, or asks first when changes are unsaved. */
  navigate: (href: string) => void;
  /** The confirmation dialog; render it once. */
  dialog: ReactNode;
}

/**
 * In-app navigation out of the editor (back, history, SEO). With unsaved changes the user can
 * stay, save and leave, or leave without saving.
 */
export function useLeaveGuard(
  store: EditorStore,
  ensureSaved: () => Promise<SaveDraftResponse>,
  push: (href: string) => void,
): LeaveGuard {
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useCallback(
    (href: string) => {
      if (isUnsaved(store.getState().saveState)) {
        setError(null);
        setPendingHref(href);
        return;
      }
      push(href);
    },
    [store, push],
  );

  async function saveAndLeave(href: string) {
    setSaving(true);
    setError(null);
    try {
      await ensureSaved();
      setPendingHref(null);
      push(href);
    } catch (caught) {
      setError(saveErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  const dialog = (
    <Dialog
      open={pendingHref !== null}
      onOpenChange={(open) => {
        if (!open && !saving) {
          setPendingHref(null);
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
              setPendingHref(null);
            }}
          >
            Ở lại
          </Button>
          <Button
            variant="danger"
            disabled={saving}
            onClick={() => {
              if (pendingHref !== null) {
                setPendingHref(null);
                push(pendingHref);
              }
            }}
          >
            Rời trang, bỏ thay đổi
          </Button>
          <Button
            loading={saving}
            onClick={() => {
              if (pendingHref !== null) {
                void saveAndLeave(pendingHref);
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
