'use client';

import {
  endpoints,
  type PageDetailResponse,
  type PageSummary,
  type ReleaseSummary,
} from '@plp/contracts';
import { ConfirmDialog, useToast } from '@plp/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ApiError, api } from '../../lib/api';
import { pageHref } from '../shell/navigation';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { pageQueryKeys } from './queries';
import styles from './HistoryScreen.module.css';

export interface RestoreDraftDialogProps {
  page: PageSummary;
  release: ReleaseSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The page as the dialog just read it, so the header around it says the same. */
  onPageRead: (page: PageSummary) => void;
  /** After the draft was replaced; the caller refreshes the page and its activity. */
  onRestored: (detail: PageDetailResponse) => void;
}

const DRAFT_CHANGED =
  'Bản nháp vừa được lưu ở nơi khác. Kiểm tra lại những gì sẽ mất bên trên rồi sao chép lại.';

function isRevisionConflict(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'revision_conflict';
}

/**
 * "Sao chép vào bản nháp" (ARCHITECTURE §2.1.6): replaces the draft with a release's content.
 * Opening it reads the draft again, so the changes it says will be lost are the ones there now,
 * and the restore is based on that revision (ADR-005): a draft saved elsewhere meanwhile is never
 * overwritten unseen, the server answers a conflict and the dialog shows the new state. Releases
 * and the live page stay as they are.
 */
export function RestoreDraftDialog({
  page,
  release,
  open,
  onOpenChange,
  onPageRead,
  onRestored,
}: RestoreDraftDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const editHref = pageHref(page.siteId, page.id, 'edit');

  const base = useQuery({
    queryKey: pageQueryKeys.draftBase(page.siteId, page.id),
    queryFn: async ({ signal }) => {
      const detail = await api(endpoints.getPage, [page.id], { signal });
      onPageRead(detail.page);
      return detail;
    },
    enabled: open,
    staleTime: 0,
    gcTime: 0,
  });

  const restore = useMutation({
    mutationFn: (detail: PageDetailResponse) =>
      api(endpoints.restoreDraft, [page.id], {
        body: { baseRevision: detail.draft.revision, releaseId: release.id },
      }),
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
      if (isRevisionConflict(error)) {
        void base.refetch();
        return;
      }
      reportUnexpected('Copying a release into the draft failed', error);
    },
  });

  const current = base.data;
  const status = (current?.page ?? page).status;
  const loses =
    status.kind === 'live_with_changes' && status.changeCount > 0
      ? ` ${status.changeCount} thay đổi chưa xuất bản sẽ mất.`
      : '';
  const error =
    restore.error !== null
      ? isRevisionConflict(restore.error)
        ? DRAFT_CHANGED
        : problemMessage(restore.error)
      : base.error !== null
        ? `Chưa đọc được bản nháp hiện tại: ${problemMessage(base.error)} Đóng rồi mở lại để thử lại.`
        : undefined;

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
      description={
        current === undefined
          ? 'Đang kiểm tra bản nháp hiện tại…'
          : `Bản nháp hiện tại sẽ được thay bằng nội dung của v${release.version}.${loses}`
      }
      confirmLabel="Sao chép vào bản nháp"
      tone={loses === '' ? 'default' : 'danger'}
      pending={restore.isPending}
      confirmDisabled={current === undefined || base.isFetching}
      error={error}
      onConfirm={() => {
        if (current !== undefined) {
          restore.mutate(current);
        }
      }}
    >
      <p className={styles.dialogNote}>
        Trang live không thay đổi. Bạn có thể sửa tiếp rồi xuất bản thành phiên bản mới.
      </p>
    </ConfirmDialog>
  );
}
