'use client';

import { endpoints, type PageSummary } from '@plp/contracts';
import { ConfirmDialog, useToast } from '@plp/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type RefObject, useId } from 'react';
import { api, ApiError } from '../../lib/api';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { siteQueryKeys } from './queries';
import styles from './DeletePageDialog.module.css';

/** The page "Xóa trang" acts on. Only a page that is not live may be deleted (ADR-027). */
export type DeletablePage = Pick<PageSummary, 'id' | 'siteId' | 'title'>;

/** Whether the page may be deleted now: nothing of it is live. */
export function deletable(page: Pick<PageSummary, 'liveRelease'>): boolean {
  return page.liveRelease === null;
}

/** Why "Xóa trang" is disabled for a live page. */
export const UNPUBLISH_BEFORE_DELETE = 'Gỡ xuất bản trước khi xóa';

export interface DeletePageDialogProps {
  page: DeletablePage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Runs once the page is gone, deleted now or by someone else just before; the site's page and
   * activity queries are refreshed already.
   */
  onDeleted?: (() => void) | undefined;
  /** Runs when the page went live meanwhile (409), after the queries were refreshed. */
  onConflict?: (() => void) | undefined;
  /** Where focus goes on close when the element that opened the dialog is gone. */
  fallbackFocusRef?: RefObject<HTMLElement | null> | undefined;
}

/**
 * "Xóa trang" (ADR-027): says what goes for good (the draft, the versions, the redirects) and what
 * stays (the leads received, with the text they agreed to, and the numbers of "Hiệu quả").
 */
export function DeletePageDialog({
  page,
  open,
  onOpenChange,
  onDeleted,
  onConflict,
  fallbackFocusRef,
}: DeletePageDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const headingId = useId();

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: siteQueryKeys.site(page.siteId) });
  }

  const remove = useMutation({
    mutationFn: () => api(endpoints.deletePage, [page.siteId, page.id]),
    onSuccess: () => {
      refresh();
      toast({
        tone: 'success',
        title: `Đã xóa trang “${page.title}”`,
        description: 'Lead đã nhận từ trang này vẫn ở trong hộp thư.',
      });
      onOpenChange(false);
      onDeleted?.();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 404) {
        // Someone deleted it first: what the user asked for is done.
        refresh();
        toast({ tone: 'neutral', title: `Trang “${page.title}” đã được xóa trước đó` });
        onOpenChange(false);
        onDeleted?.();
        return;
      }
      if (error instanceof ApiError && error.code === 'page_live') {
        refresh();
        toast({
          tone: 'warning',
          title: 'Trang vừa được xuất bản',
          description: `${problemMessage(error)} Danh sách đã được tải lại.`,
        });
        onOpenChange(false);
        onConflict?.();
        return;
      }
      reportUnexpected('Deleting the page failed', error);
    },
  });

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          remove.reset();
        }
        onOpenChange(next);
      }}
      fallbackFocusRef={fallbackFocusRef}
      title={`Xóa trang “${page.title}”?`}
      description="Không thể hoàn tác."
      tone="danger"
      confirmLabel="Xóa trang"
      pending={remove.isPending}
      error={remove.error === null ? undefined : problemMessage(remove.error)}
      onConfirm={() => {
        remove.mutate();
      }}
    >
      <div className={styles.columns}>
        <section aria-labelledby={`${headingId}-gone`}>
          <h3 id={`${headingId}-gone`} className={styles.heading}>
            Bị xóa
          </h3>
          <ul className={styles.list}>
            <li>Bản nháp và nội dung của trang</li>
            <li>Lịch sử phiên bản</li>
            <li>Chuyển hướng từ đường dẫn cũ</li>
          </ul>
        </section>
        <section aria-labelledby={`${headingId}-kept`}>
          <h3 id={`${headingId}-kept`} className={styles.heading}>
            Vẫn giữ
          </h3>
          <ul className={styles.list}>
            <li>Lead đã nhận, kèm nội dung đồng ý khách đã thấy</li>
            <li>Số liệu Hiệu quả của trang</li>
          </ul>
        </section>
      </div>
    </ConfirmDialog>
  );
}
