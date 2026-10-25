import type { ActivityItem } from '@plp/contracts';
import { Card, VisuallyHidden, WarningTriangleIcon } from '@plp/ui';
import Link from 'next/link';
import { type DateInput, formatDateTime, formatRelativeTime } from '../../lib/format';
import { cx } from '../shell/cx';
import { pageHref } from '../shell/navigation';
import { activitySentence } from './activity-sentence';
import styles from './RecentActivity.module.css';

export interface RecentActivityProps {
  siteId: string;
  items: readonly ActivityItem[];
  now: DateInput;
}

/**
 * "Hoạt động xuất bản gần đây": the latest activity of the site, newest first. As on board 01 it
 * ends with "Xem lịch sử phiên bản →", which opens the history of the page that changed last
 * (history is kept per page).
 */
export function RecentActivity({ siteId, items, now }: RecentActivityProps) {
  const latestPage = items.find((item) => item.page !== null)?.page ?? null;
  return (
    <Card as="section" aria-labelledby="activity-heading" className={styles.card}>
      <h2 id="activity-heading" className={styles.heading}>
        Hoạt động xuất bản gần đây
      </h2>
      {items.length === 0 ? (
        <p className={styles.empty}>
          Chưa có hoạt động nào. Khi bạn xuất bản, khôi phục hay gỡ trang, nhật ký sẽ hiện ở đây.
        </p>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => {
            const sentence = activitySentence(item);
            return (
              <li key={item.id} className={styles.item}>
                <span
                  className={cx(styles.dot, styles[`tone-${sentence.tone}`])}
                  aria-hidden="true"
                />
                <span className={styles.text}>
                  <strong className={styles.actor}>{sentence.actor}</strong> {sentence.text}{' '}
                  <time
                    dateTime={item.createdAt}
                    title={formatDateTime(item.createdAt)}
                    className={styles.when}
                  >
                    · {formatRelativeTime(item.createdAt, now)}
                  </time>
                  {item.data.revalidationFailed ? (
                    <span className={styles.revalidation}>
                      <WarningTriangleIcon size={14} strokeWidth={2} />
                      Trang live có thể cập nhật chậm
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {latestPage === null ? null : (
        <Link href={pageHref(siteId, latestPage.id, 'history')} className={styles.historyLink}>
          Xem lịch sử phiên bản
          <VisuallyHidden> của trang “{latestPage.title}”</VisuallyHidden>
          <span aria-hidden="true"> →</span>
        </Link>
      )}
    </Card>
  );
}
