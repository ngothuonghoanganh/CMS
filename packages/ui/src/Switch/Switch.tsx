'use client';

import { Switch as RadixSwitch } from 'radix-ui';
import { type ComponentPropsWithRef, type ReactNode, useId } from 'react';
import { joinIds } from '../Field/FieldContext';
import { cx } from '../internal/cx';
import { hasContent } from '../internal/hasContent';
import styles from './Switch.module.css';

type RootProps = ComponentPropsWithRef<typeof RadixSwitch.Root>;

export interface SwitchProps extends Omit<RootProps, 'className' | 'children' | 'asChild'> {
  /** Visible label; clicking it toggles the switch. */
  label: ReactNode;
  /** Longer explanation under the label, announced as the description. */
  description?: ReactNode;
  /** Class for the row that holds the label and the switch. */
  className?: string | undefined;
}

/** On/off setting with `role="switch"`, 44 × 26 as in the boards, label on the left. */
export function Switch({
  label,
  description,
  className,
  id,
  'aria-describedby': describedBy,
  ...rest
}: SwitchProps) {
  const baseId = useId();
  const switchId = id ?? `${baseId}-switch`;
  const descriptionId = `${baseId}-description`;
  const hasDescription = hasContent(description);
  return (
    <div className={cx(styles.row, className)}>
      <div className={styles.text}>
        <label htmlFor={switchId} className={styles.label}>
          {label}
        </label>
        {hasDescription ? (
          <p id={descriptionId} className={styles.description}>
            {description}
          </p>
        ) : null}
      </div>
      <RadixSwitch.Root
        {...rest}
        id={switchId}
        aria-describedby={joinIds(hasDescription && descriptionId, describedBy)}
        className={styles.root}
      >
        <RadixSwitch.Thumb className={styles.thumb} />
      </RadixSwitch.Root>
    </div>
  );
}
