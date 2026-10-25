'use client';

import type { ComponentPropsWithRef } from 'react';
import { joinIds, toneOf, useFieldContext } from '../Field/FieldContext';
import { ChevronDownIcon } from '../icons';
import { cx } from '../internal/cx';
import styles from '../Field/Control.module.css';

export interface SelectProps extends Omit<
  ComponentPropsWithRef<'select'>,
  'className' | 'multiple'
> {
  /** Danger border without a Field (a Field with an error sets it automatically). */
  invalid?: boolean | undefined;
  /** Class for the frame around the select. */
  className?: string | undefined;
}

/** A styled native `<select>`: the most accessible control for a short list of choices. */
export function Select({
  invalid = false,
  className,
  id,
  children,
  'aria-describedby': describedBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
  ...rest
}: SelectProps) {
  const field = useFieldContext();
  const tone = toneOf(field?.tone, invalid);
  return (
    <div className={cx(styles.control, styles[tone], className)}>
      <select
        {...rest}
        id={id ?? field?.control.id}
        aria-describedby={joinIds(field?.control['aria-describedby'], describedBy)}
        aria-invalid={ariaInvalid ?? (invalid ? true : field?.control['aria-invalid'])}
        aria-required={ariaRequired ?? field?.control['aria-required']}
        className={cx(styles.native, styles.select)}
      >
        {children}
      </select>
      <span className={styles.selectChevron} aria-hidden="true">
        <ChevronDownIcon size={16} />
      </span>
    </div>
  );
}
