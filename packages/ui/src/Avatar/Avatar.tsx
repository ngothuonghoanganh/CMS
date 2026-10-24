import { cx } from '../internal/cx';
import { initialsOf } from './initials';
import styles from './Avatar.module.css';

export interface AvatarProps {
  /** Full name; the avatar shows its initials. */
  name: string;
  /** 32 (default) or 28 pixels. */
  size?: 28 | 32 | undefined;
  /** `circle` for people, `square` for a workspace. Defaults to `circle`. */
  shape?: 'circle' | 'square' | undefined;
  /**
   * Avatars sit next to the visible name, so they are decorative by default. Set this when the
   * avatar stands alone and must be announced.
   */
  labelled?: boolean | undefined;
  className?: string | undefined;
}

export function Avatar({
  name,
  size = 32,
  shape = 'circle',
  labelled = false,
  className,
}: AvatarProps) {
  const accessibility = labelled
    ? ({ role: 'img', 'aria-label': name } as const)
    : ({ 'aria-hidden': true } as const);
  return (
    <span
      {...accessibility}
      className={cx(styles.avatar, styles[shape], styles[`size-${size}`], className)}
    >
      {initialsOf(name)}
    </span>
  );
}
