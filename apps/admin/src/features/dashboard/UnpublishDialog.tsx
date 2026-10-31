'use client';

import {
  endpoints,
  type LiveReleaseRef,
  type PageSummary,
  type PointerMoveResponse,
} from '@plp/contracts';
import { ConfirmDialog, useToast } from '@plp/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RefObject } from 'react';
import { api, ApiError } from '../../lib/api';
import { displayUrl } from '../../lib/site-url';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { siteQueryKeys } from './queries';
import styles from './UnpublishDialog.module.css';

/** Same bound as `pointerMoveRequestSchema.reason`. */
const REASON_MAX = 300;

/** A page that has a live release, so it can be unpublished. */
export type UnpublishablePage = Pick<PageSummary, 'id' | 'siteId' | 'title' | 'liveUrl'> & {
  liveRelease: LiveReleaseRef;
};

function isConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}

/** Narrows a page summary to an unpublishable page, or null when nothing is live. */
export function unpublishable(page: PageSummary): UnpublishablePage | null {
  const { liveRelease } = page;
  return liveRelease === null ? null : { ...page, liveRelease };
}

export interface UnpublishDialogProps {
  page: UnpublishablePage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Runs after a successful unpublish; the site's page and activity queries are refreshed already. */
  onUnpublished?: ((result: PointerMoveResponse) => void) | undefined;
  /** Runs when the live page changed in the meantime (409), after the queries were refreshed. */
  onConflict?: (() => void) | undefined;
  /**
   * Where focus goes on close when the element that opened the dialog is gone: a page header's
   * "Tùy chọn khác" exists for a live page only, so unpublishing removes it.
   */
  fallbackFocusRef?: RefObject<HTMLElement | null> | undefined;
}

/**
 * "Gỡ xuất bản" with a required reason: moves the live pointer to nothing (`movePointer` with
 * `targetReleaseId: null`), expecting the release that is live now. The draft and history stay.
 */
export function UnpublishDialog({
  page,
  open,
  onOpenChange,
  onUnpublished,
  onConflict,
  fallbackFocusRef,
}: UnpublishDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const unpublish = useMutation({
    mutationFn: (reason: string) =>
      api(endpoints.movePointer, [page.id], {
        body: {
          targetReleaseId: null,
          expectedCurrentReleaseId: page.liveRelease.id,
          reason,
        },
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: siteQueryKeys.site(page.siteId) });
      toast({
        tone: result.revalidation === 'failed' ? 'warning' : 'success',
        title: `Đã gỡ xuất bản “${page.title}”`,
        description:
          result.revalidation === 'failed'
            ? 'Trang live có thể mất tới 5 phút để cập nhật.'
            : 'Bản nháp và lịch sử phiên bản vẫn được giữ nguyên.',
      });
      onOpenChange(false);
      onUnpublished?.(result);
    },
    onError: (error) => {
      if (isConflict(error)) {
        void queryClient.invalidateQueries({ queryKey: siteQueryKeys.site(page.siteId) });
        toast({
          tone: 'warning',
          title: 'Trang live vừa thay đổi',
          description: `${problemMessage(error)}. Danh sách đã được tải lại, hãy kiểm tra rồi thử lại.`,
        });
        onOpenChange(false);
        onConflict?.();
        return;
      }
      reportUnexpected('Unpublishing failed', error);
    },
  });

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          unpublish.reset();
        }
        onOpenChange(next);
      }}
      fallbackFocusRef={fallbackFocusRef}
      title={`Gỡ xuất bản “${page.title}”?`}
      description="Khách truy cập sẽ không xem được trang này nữa. Bản nháp và các phiên bản cũ vẫn được giữ, bạn có thể xuất bản lại bất cứ lúc nào."
      tone="danger"
      confirmLabel="Gỡ xuất bản"
      reason={{
        label: 'Lý do',
        labelNote: 'ghi vào nhật ký hoạt động',
        placeholder: 'Ví dụ: Chương trình ưu đãi đã kết thúc',
        maxLength: REASON_MAX,
      }}
      pending={unpublish.isPending}
      error={
        unpublish.error === null || isConflict(unpublish.error)
          ? undefined
          : problemMessage(unpublish.error)
      }
      onConfirm={(reason) => {
        unpublish.mutate(reason);
      }}
    >
      {page.liveUrl === null ? null : (
        <p className={styles.address}>
          Đang live tại <span className={styles.url}>{displayUrl(page.liveUrl)}</span>
          {` · v${page.liveRelease.version}`}
        </p>
      )}
    </ConfirmDialog>
  );
}
