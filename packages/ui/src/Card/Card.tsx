import type { HTMLAttributes } from 'react';
import { cx } from '../internal/cx';
import styles from './Card.module.css';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'className'> {
  /** Landmark or list element when the card is one, e.g. `section` with `aria-labelledby`. */
  as?: 'div' | 'section' | 'article' | 'aside' | 'li' | undefined;
  /** `md` (18px 20px) as on the dashboard, `lg` (22px 24px) for forms, `none` for tables. */
  padding?: 'none' | 'md' | 'lg' | undefined;
  className?: string | undefined;
}

/** White surface with the admin border and radius 14. */
export function Card({ as: Element = 'div', padding = 'md', className, ...rest }: CardProps) {
  return <Element {...rest} className={cx(styles.card, styles[`padding-${padding}`], className)} />;
}
