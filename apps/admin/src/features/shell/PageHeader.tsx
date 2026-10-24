import type { ReactNode } from 'react';
import { cx } from './cx';
import styles from './PageHeader.module.css';

export interface PageContainerProps {
  /** `wide` (1120px) for lists such as the dashboard, `narrow` (960px) for settings-like pages. */
  width?: 'wide' | 'narrow' | undefined;
  children: ReactNode;
}

/** Centers the content of a workspace page inside the shell's `<main>`. */
export function PageContainer({ width = 'wide', children }: PageContainerProps) {
  return <div className={cx(styles.container, styles[width])}>{children}</div>;
}

export interface PageHeaderProps {
  /** Small line above the title, e.g. "Mây Xanh Agency / Nha khoa Smile Care". */
  context?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Buttons on the right, e.g. "Xem site live" and "Tạo trang". */
  actions?: ReactNode;
}

/** Page title row of the workspace boards: context line, h1, description and actions. */
export function PageHeader({ context, title, description, actions }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.heading}>
        {context ? <p className={styles.context}>{context}</p> : null}
        <h1 className={styles.title}>{title}</h1>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
