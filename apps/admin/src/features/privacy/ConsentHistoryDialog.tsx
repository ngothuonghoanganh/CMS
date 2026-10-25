'use client';

import { endpoints } from '@plp/contracts';
import { Button, Callout, Dialog, Spinner } from '@plp/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { problemMessage } from '../shell/problem-message';
import styles from './PrivacyScreen.module.css';

const VERSIONS_PER_PAGE = 20;

export const consentVersionsQueryKey = (siteId: string) =>
  ['sites', siteId, 'consent-versions'] as const;

export interface ConsentHistoryDialogProps {
  siteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Every saved consent version, newest first: the texts leads agreed to (ADR-017). */
export function ConsentHistoryDialog({ siteId, open, onOpenChange }: ConsentHistoryDialogProps) {
  const versions = useInfiniteQuery({
    queryKey: consentVersionsQueryKey(siteId),
    queryFn: ({ pageParam, signal }) =>
      api(endpoints.listConsentVersions, [siteId], {
        query: { limit: VERSIONS_PER_PAGE, ...(pageParam === null ? {} : { cursor: pageParam }) },
        signal,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: open,
  });
  const items = versions.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Các bản nội dung đồng ý"
      description="Mỗi lead giữ bản nó đã đồng ý. Không bản nào bị sửa hay xóa."
    >
      {versions.isPending ? (
        <div className={styles.historyLoading}>
          <Spinner label="Đang tải các bản đã lưu" />
        </div>
      ) : null}
      {versions.isError ? (
        <Callout tone="danger" role="alert" title="Chưa tải được các bản đã lưu">
          {problemMessage(versions.error)}
        </Callout>
      ) : null}
      <ol className={styles.history}>
        {items.map((version) => (
          <li key={version.id} className={styles.historyItem}>
            <h3 className={styles.historyTitle}>
              {`Bản ${version.version} · ${formatDateTime(version.createdAt)} · ${version.createdBy.name}`}
            </h3>
            <p className={styles.historyText}>{version.requiredText}</p>
            <p className={styles.historyMarketing}>
              {version.marketingText === null
                ? 'Không có ô nhận ưu đãi'
                : `Ô nhận ưu đãi: ${version.marketingText}`}
            </p>
          </li>
        ))}
      </ol>
      {versions.hasNextPage ? (
        <Button
          variant="secondary"
          loading={versions.isFetchingNextPage}
          onClick={() => void versions.fetchNextPage()}
        >
          Xem thêm
        </Button>
      ) : null}
    </Dialog>
  );
}
