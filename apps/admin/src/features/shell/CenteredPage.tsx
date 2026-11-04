import type { ReactNode } from 'react';
import { Brand } from './Brand';
import { cx } from './cx';
import styles from './CenteredPage.module.css';

export interface CenteredPageProps {
  /** `sm` (420px) for sign-in forms, `md` (640px) for setup forms such as creating a site. */
  width?: 'sm' | 'md' | undefined;
  children: ReactNode;
}

/** A focused page without the sidebar: the logo on top and one centered column. */
export function CenteredPage({ width = 'sm', children }: CenteredPageProps) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Brand className={styles.brand} />
      </header>
      <main id="main-content" className={cx(styles.main, styles[width])}>
        {children}
      </main>
    </div>
  );
}
