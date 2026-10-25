import { Skeleton, Spinner } from '@plp/ui';
import styles from './ScreenSkeleton.module.css';

const LOADING_LABEL = 'Đang tải trang…';

/**
 * Shown inside the site frame while a site screen renders on the server, so a click on the
 * sidebar, a page tab or "Lịch sử phiên bản" gets feedback at once.
 */
export function SiteScreenSkeleton() {
  return (
    <div className={styles.site} aria-busy="true">
      <Spinner label={LOADING_LABEL} className={styles.spinner} />
      <Skeleton width={260} height={28} />
      <Skeleton width={380} />
      <div className={styles.rows}>
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} shape="block" height={56} />
        ))}
      </div>
    </div>
  );
}

/** The editor frame (top bar and three columns) while the page and its draft load. */
export function EditorSkeleton() {
  return (
    <div className={styles.editor}>
      <div className={styles.editorBar}>
        <Skeleton width={220} height={20} />
        <Skeleton width={180} height={36} shape="block" />
      </div>
      <main id="main-content" className={styles.editorColumns} aria-busy="true">
        <Spinner label={LOADING_LABEL} className={styles.spinner} />
        <div className={styles.editorSide}>
          {[0, 1, 2, 3, 4].map((row) => (
            <Skeleton key={row} shape="block" height={48} />
          ))}
        </div>
        <div className={styles.editorCanvas}>
          <Skeleton shape="block" height={420} />
        </div>
        <div className={styles.editorSide}>
          <Skeleton width="60%" height={18} />
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} shape="block" height={44} />
          ))}
        </div>
      </main>
    </div>
  );
}
