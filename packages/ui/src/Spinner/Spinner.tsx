import { cx } from '../internal/cx';
import { VisuallyHidden } from '../VisuallyHidden/VisuallyHidden';
import styles from './Spinner.module.css';

export interface SpinnerProps {
  /** Diameter in pixels. Defaults to 16. */
  size?: number | undefined;
  /**
   * Announced text, e.g. "Đang tải". Without a label the spinner is decorative and the
   * surrounding control must expose its busy state (for example `aria-busy`).
   */
  label?: string | undefined;
  className?: string | undefined;
}

export function Spinner({ size = 16, label, className }: SpinnerProps) {
  const graphic = (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={styles.graphic}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
  if (label === undefined) {
    return <span className={cx(styles.root, className)}>{graphic}</span>;
  }
  return (
    <span role="status" className={cx(styles.root, className)}>
      {graphic}
      <VisuallyHidden>{label}</VisuallyHidden>
    </span>
  );
}
