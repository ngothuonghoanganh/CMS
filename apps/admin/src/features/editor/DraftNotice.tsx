'use client';

import { endpoints, type SaveDraftResponse } from '@plp/contracts';
import { Callout, ConfirmDialog, useToast } from '@plp/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ApiError, api } from '../../lib/api';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import styles from './DraftNotice.module.css';
import { useEditor, useEditorStoreApi } from './editor-context';
import { displayUrl, siteChangesNotice } from './presentation';
import { replaceWithServerDraft } from './server-draft';
import { markPageScreensStale } from './stale-screens';
import { DraftConflictError } from './use-draft-saver';

export interface DraftNoticeProps {
  ensureSaved: () => Promise<SaveDraftResponse>;
}

/**
 * The amber strip under the top bar: editing never changes the live page until publishing. When
 * the draft differs from the live release, it offers to replace the draft with the live version.
 * When the site settings changed after the live release, it says the live page keeps the old look
 * until the next publish (ADR-015).
 */
export function DraftNotice({ ensureSaved }: DraftNoticeProps) {
  const store = useEditorStoreApi();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const page = useEditor((state) => state.page);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // After a restore the action is gone (nothing left to discard); focus lands on the notice.
  const noticeRef = useRef<HTMLDivElement>(null);
  const live = page.liveRelease;
  // A draft restored from live has a new revision but no changes (rule 2): nothing to discard.
  const canRestore =
    page.status.kind === 'live_with_changes' && page.status.changeCount > 0 && live !== null;

  async function restore() {
    if (!live) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      // Settle autosave first so the restore is based on the server's current revision.
      const saved = await ensureSaved();
      const detail = await api(endpoints.restoreDraft, [page.id], {
        body: { baseRevision: saved.revision, releaseId: live.id },
      });
      await replaceWithServerDraft(store, detail);
      markPageScreensStale(queryClient, page.siteId, page.id);
      setConfirming(false);
      toast({ title: `Bản nháp đã quay về bản live v${live.version}`, tone: 'success' });
    } catch (caught) {
      if (
        caught instanceof DraftConflictError ||
        (caught instanceof ApiError && caught.code === 'revision_conflict')
      ) {
        store.getState().markConflict();
        setConfirming(false);
      } else {
        reportUnexpected('Restoring the draft from the live release failed', caught);
        setError(problemMessage(caught));
      }
    } finally {
      setPending(false);
    }
  }

  let message;
  if (page.status.kind === 'draft') {
    message = 'Chưa có gì được xuất bản. Bản nháp chỉ nhóm của bạn nhìn thấy.';
  } else if (page.status.kind === 'unpublished' || page.liveUrl === null) {
    message =
      'Trang đã được gỡ khỏi internet. Bản nháp chỉ nhóm của bạn nhìn thấy cho tới khi bạn xuất bản lại.';
  } else {
    const siteNotice = siteChangesNotice(page);
    message = (
      <>
        Bạn đang sửa <strong>bản nháp</strong>. Trang live{' '}
        <span className={styles.url}>{displayUrl(page.liveUrl)}</span> giữ nguyên đến khi bạn xuất
        bản.
        {siteNotice === null ? null : <> {siteNotice}</>}
      </>
    );
  }

  return (
    <>
      <Callout
        ref={noticeRef}
        tabIndex={-1}
        tone="warning"
        variant="banner"
        action={
          canRestore ? (
            <button
              type="button"
              className={styles.restore}
              onClick={() => {
                setError(null);
                setConfirming(true);
              }}
            >
              Hủy thay đổi, quay về bản live
            </button>
          ) : null
        }
      >
        {message}
      </Callout>
      {live ? (
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={`Quay về bản live v${live.version}?`}
          description={`Bản nháp sẽ được thay bằng nội dung của v${live.version} đang live. ${page.status.changeCount} thay đổi chưa xuất bản sẽ mất và không hoàn tác được.`}
          confirmLabel="Quay về bản live"
          fallbackFocusRef={noticeRef}
          tone="danger"
          pending={pending}
          error={error}
          onConfirm={() => {
            void restore();
          }}
        >
          <p className={styles.dialogNote}>Trang live không thay đổi.</p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}
