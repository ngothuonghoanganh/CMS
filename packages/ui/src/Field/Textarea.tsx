'use client';

import type { ComponentPropsWithRef } from 'react';
import { cx } from '../internal/cx';
import { joinIds, toneOf, useFieldContext } from './FieldContext';
import styles from './Control.module.css';

export interface TextareaProps extends Omit<ComponentPropsWithRef<'textarea'>, 'className'> {
  /** Danger border without a Field (a Field with an error sets it automatically). */
  invalid?: boolean | undefined;
  /** Class for the frame around the textarea. */
  className?: string | undefined;
}

export function Textarea({
  invalid = false,
  className,
  id,
  rows = 3,
  'aria-describedby': describedBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
  ...rest
}: TextareaProps) {
  const field = useFieldContext();
  const tone = toneOf(field?.tone, invalid);
  return (
    <div className={cx(styles.control, styles.textareaFrame, styles[tone], className)}>
      <textarea
        {...rest}
        rows={rows}
        id={id ?? field?.control.id}
        aria-describedby={joinIds(field?.control['aria-describedby'], describedBy)}
        aria-invalid={ariaInvalid ?? (invalid ? true : field?.control['aria-invalid'])}
        aria-required={ariaRequired ?? field?.control['aria-required']}
        className={cx(styles.native, styles.textarea)}
      />
    </div>
  );
}
