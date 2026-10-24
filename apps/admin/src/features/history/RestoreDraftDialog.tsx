'use client';

import {
  endpoints,
  type PageDetailResponse,
  type PageSummary,
  type ReleaseSummary,
} from '@plp/contracts';
import { ConfirmDialog, useToast } from '@plp/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { pageHref } from '../shell/navigation';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import styles from './HistoryScreen.module.css';

export interface RestoreDraftDialogProps {
  page: PageSummary;
  release: ReleaseSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After the draft was replaced; the caller refreshes the page and its activity. */
  onRestored: (detail: PageDetailResponse) => void;
}

/**
 * "Sao chép vào bản nháp" (ARCHITECTURE §2.1.6): replaces the draft with a release's content. It
 * reads the current draft revision right before, so the restore is based on the latest draft;
 * releases and the live page stay as they are.
 */
export function RestoreDraftDialog({
  page,
  release,
  open,
  onOpenChange,
  onRestored,
}: RestoreDraftDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const editHref = pageHref(page.siteId, page.id, 'edit');

  const restore = useMutation({
    mutationFn: async () => {
      const current = await api(endpoints.getPage, [page.id]);
      return api(endpoints.restoreDraft, [page.id], {
        body: { baseRevision: current.draft.revision, releaseId: release.id },
      });
    },
    onSuccess: (detail) => {
      onRestored(detail);
      onOpenChange(false);
      toast({
        tone: 'success',
        title: `Đã sao chép v${release.version} vào bản nháp`,
        description: 'Trang live không thay đổi cho tới khi bạn xuất bản.',
        action: {
          label: 'Mở editor',
          onClick: () => {
            router.push(editHref);
          },
        },
      });
    },
    onError: (error) => {
      reportUnexpected('Copying a release into the draft failed', error);
    },
  });

  const loses =
    page.status.kind === 'live_with_changes' && page.status.changeCount > 0
      ? ` ${page.status.changeCount} thay đổi chưa xuất bản sẽ mất.`
      : '';

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          restore.reset();
        }
        onOpenChange(next);
      }}
      title={`Sao chép v${release.version} vào bản nháp?`}
      description={`Bản nháp hiện tại sẽ được thay bằng nội dung của v${release.version}.${loses}`}
      confirmLabel="Sao chép vào bản nháp"
      pending={restore.isPending}
      error={restore.error === null ? undefined : problemMessage(restore.error)}
      onConfirm={() => {
        restore.mutate();
      }}
    >
      <p className={styles.dialogNote}>
        Trang live không thay đổi. Bạn có thể sửa tiếp rồi xuất bản thành phiên bản mới.
      </p>
    </ConfirmDialog>
  );
}
