import type { ReactNode } from 'react';
import { cx } from '../internal/cx';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Primary next step, e.g. a "Tạo trang" button. */
  action?: ReactNode;
  /** Heading level that fits the page outline. Defaults to 2. */
  headingLevel?: 2 | 3 | undefined;
  className?: string | undefined;
}

/** Explains why a list or area is empty and offers the next step. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  headingLevel = 2,
  className,
}: EmptyStateProps) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  return (
    <div className={cx(styles.root, className)}>
      {icon ? (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <Heading className={styles.title}>{title}</Heading>
      {description ? <p className={styles.description}>{description}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
