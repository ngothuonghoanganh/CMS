import type { ComponentPropsWithRef } from 'react';
import { cx } from '../internal/cx';
import styles from './VisuallyHidden.module.css';

export type VisuallyHiddenProps = ComponentPropsWithRef<'span'>;

/** Text for assistive technology only, e.g. a hidden legend or a status announcement. */
export function VisuallyHidden({ className, ...rest }: VisuallyHiddenProps) {
  return <span {...rest} className={cx(styles.root, className)} />;
}
