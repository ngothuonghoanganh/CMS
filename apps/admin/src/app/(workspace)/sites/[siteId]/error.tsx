'use client';

import { RouteError } from '../../../../features/shell/RouteError';
import styles from './error.module.css';

/**
 * A site screen (dashboard, history, SEO, domain, settings) that failed to load. It renders inside
 * the site frame, so the sidebar stays and the user can move on to another screen.
 */
export default function SiteScreenError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className={styles.page}>
      <RouteError error={error} retry={retry} />
    </div>
  );
}
