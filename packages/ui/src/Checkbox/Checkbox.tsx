'use client';

import { type ComponentPropsWithRef, type ReactNode, useId } from 'react';
import { joinIds } from '../Field/FieldContext';
import { cx } from '../internal/cx';
import { hasContent } from '../internal/hasContent';
import styles from './Checkbox.module.css';

export interface CheckboxProps extends Omit<
  ComponentPropsWithRef<'input'>,
  'type' | 'className' | 'children'
> {
  label: ReactNode;
  /** Explanation under the label, announced as the description (not part of the name). */
  description?: ReactNode;
  /** Class for the row. */
  className?: string | undefined;
}

/** Native checkbox whose label is part of the click target, e.g. "Ảnh chỉ để trang trí". */
export function Checkbox({
  label,
  description,
  className,
  id,
  'aria-describedby': describedBy,
  ...rest
}: CheckboxProps) {
  const baseId = useId();
  const inputId = id ?? `${baseId}-checkbox`;
  const descriptionId = `${baseId}-description`;
  const hasDescription = hasContent(description);
  return (
    <div className={cx(styles.row, className)}>
      <input
        {...rest}
        id={inputId}
        type="checkbox"
        aria-describedby={joinIds(hasDescription && descriptionId, describedBy)}
        className={styles.box}
      />
      <div className={styles.text}>
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
        {hasDescription ? (
          <span id={descriptionId} className={styles.description}>
            {description}
          </span>
        ) : null}
      </div>
    </div>
  );
}
