import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cx } from '../internal/cx';
import styles from './Badge.module.css';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'primary' | 'muted';
export type BadgeSize = 'md' | 'sm';

export interface BadgeProps extends Omit<ComponentPropsWithRef<'span'>, 'className'> {
  /** Defaults to `neutral`. `primary` is solid (counts such as "12 mới"); `muted` is outlined. */
  tone?: BadgeTone | undefined;
  /** Leading status dot (decorative). */
  dot?: boolean | undefined;
  /** Leading decorative icon, e.g. a lock for "Đã kết nối · HTTPS". */
  icon?: ReactNode;
  /** `md` for statuses, `sm` for compact labels such as "ĐANG LIVE". Defaults to `md`. */
  size?: BadgeSize | undefined;
  className?: string | undefined;
}

/** A pill label (radius 999). The text is the accessible content; dots and icons are hidden. */
export function Badge({
  tone = 'neutral',
  dot = false,
  icon,
  size = 'md',
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      {...rest}
      className={cx(styles.badge, styles[tone], styles[size], className)}
      data-tone={tone}
    >
      {dot ? <span className={styles.dot} aria-hidden="true" /> : null}
      {icon ? (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}
