'use client';

import { endpoints } from '@plp/contracts';
import { Button, Callout } from '@plp/ui';
import { AlertDialog } from 'radix-ui';
import { useRef, useState } from 'react';
import { api } from '../../lib/api';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import styles from './ConflictDialog.module.css';
import { useEditor, useEditorStoreApi } from './editor-context';
import { replaceWithServerDraft } from './server-draft';

/**
 * Blocking dialog after a revision conflict (409): someone saved this draft elsewhere. The only
 * way on is to reload the latest draft, discarding the local changes; nothing is merged silently.
 * It has no cancel: editing on would only produce more changes that cannot be saved.
 */
export function ConflictDialog() {
  const store = useEditorStoreApi();
  const open = useEditor((state) => state.saveState === 'conflict');
  const pageId = useEditor((state) => state.page.id);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reloadRef = useRef<HTMLButtonElement>(null);

  async function reload() {
    setPending(true);
    setError(null);
    try {
      const detail = await api(endpoints.getPage, [pageId]);
      await replaceWithServerDraft(store, detail);
    } catch (caught) {
      reportUnexpected('Reloading the latest draft failed', caught);
      setError(problemMessage(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog.Root open={open}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={styles.overlay} />
        <AlertDialog.Content
          className={styles.content}
          onEscapeKeyDown={(event) => {
            event.preventDefault();
          }}
          // An alert dialog focuses its cancel button, and this one has none: focus would stay in
          // the field behind it, where typing goes on editing a draft that cannot be saved.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            reloadRef.current?.focus();
          }}
        >
          <AlertDialog.Title className={styles.title}>
            Trang vừa được cập nhật ở nơi khác
          </AlertDialog.Title>
          <AlertDialog.Description className={styles.description}>
            Bản nháp này vừa được lưu từ một tab hoặc một người khác, nên các thay đổi bạn làm sau
            lần lưu gần nhất không lưu được. Tải lại bản mới nhất để tiếp tục; các thay đổi chưa lưu
            ở đây sẽ bị bỏ.
          </AlertDialog.Description>
          {error ? (
            <Callout tone="danger" role="alert">
              {error}
            </Callout>
          ) : null}
          <div className={styles.footer}>
            <AlertDialog.Action asChild>
              <Button
                ref={reloadRef}
                loading={pending}
                onClick={(event) => {
                  // Keep the dialog until the new draft is in place.
                  event.preventDefault();
                  void reload();
                }}
              >
                Tải lại bản mới nhất
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
