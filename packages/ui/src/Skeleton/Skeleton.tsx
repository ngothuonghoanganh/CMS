import { cx } from '../internal/cx';
import styles from './Skeleton.module.css';

export interface SkeletonProps {
  /** CSS width; a number is pixels. Defaults to 100%. */
  width?: number | string | undefined;
  /** CSS height; a number is pixels. Defaults to 14px (one text line). */
  height?: number | string | undefined;
  /** `text` lines, `block` areas, `circle` avatars. Defaults to `text`. */
  shape?: 'text' | 'block' | 'circle' | undefined;
  className?: string | undefined;
}

/**
 * Placeholder while data loads. Decorative: put `aria-busy` on the region that is loading, or a
 * `Spinner` with a label, so assistive technology knows something is pending.
 */
export function Skeleton({
  width = '100%',
  height = 14,
  shape = 'text',
  className,
}: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(styles.skeleton, styles[shape], className)}
      style={{ width, height }}
    />
  );
}
