import { Skeleton, Spinner } from '@plp/ui';
import styles from './TemplateLibrarySkeleton.module.css';

/** Board 17 while the library renders on the server: the cards to come, drawn empty. */
export function TemplateLibrarySkeleton() {
  return (
    <div className={styles.page} aria-busy="true">
      <Spinner label="Đang tải mẫu…" className={styles.spinner} />
      <Skeleton width={200} height={28} />
      <Skeleton width={420} />
      <div className={styles.grid}>
        {[0, 1, 2, 3, 4, 5].map((card) => (
          <div key={card} className={styles.card}>
            <Skeleton shape="block" height={186} />
            <div className={styles.lines}>
              <Skeleton width="40%" height={12} />
              <Skeleton width="80%" height={12} />
              <Skeleton width="60%" height={12} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
