import { cx } from '../internal/cx';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm';

export interface ButtonStyleOptions {
  /** Defaults to `primary`. */
  variant?: ButtonVariant | undefined;
  /** `md` is 44px tall, `sm` is 36px. Defaults to `md`. */
  size?: ButtonSize | undefined;
  /** Stretch to the width of the container. */
  fullWidth?: boolean | undefined;
  className?: string | undefined;
}

/** Shared by `Button` and `ButtonLink` so a link and a button look the same. */
export function buttonClassName(
  { variant = 'primary', size = 'md', fullWidth = false, className }: ButtonStyleOptions,
  loading = false,
): string {
  return cx(
    styles.button,
    styles[variant],
    styles[size],
    fullWidth && styles.fullWidth,
    loading && styles.loading,
    className,
  );
}

export const buttonIconClassName = styles.icon;
