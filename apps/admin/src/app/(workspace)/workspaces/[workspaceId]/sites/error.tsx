'use client';

import { RouteError } from '../../../../../features/shell/RouteError';
import styles from './error.module.css';

/**
 * The Sites screen failed to load. It renders inside the workspace frame, so the sidebar stays and
 * the user can move on to another screen.
 */
export default function SitesError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className={styles.page}>
      <RouteError error={error} retry={retry} />
    </div>
  );
}
