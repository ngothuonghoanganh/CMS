import type { ActivityItem } from '@plp/contracts';
import { Card, WarningTriangleIcon } from '@plp/ui';
import { type DateInput, formatDateTime, formatRelativeTime } from '../../lib/format';
import { cx } from '../shell/cx';
import { activitySentence } from './activity-sentence';
import styles from './RecentActivity.module.css';

export interface RecentActivityProps {
  items: readonly ActivityItem[];
  now: DateInput;
}

/** "Hoạt động xuất bản gần đây": the latest activity of the site, newest first. */
export function RecentActivity({ items, now }: RecentActivityProps) {
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
    </Card>
  );
}
