'use client';

import { type ComponentPropsWithRef, type ReactNode, useId } from 'react';
import { cx } from '../internal/cx';
import { hasContent } from '../internal/hasContent';
import { joinIds, toneOf, useFieldContext } from './FieldContext';
import styles from './Control.module.css';

export interface InputProps extends Omit<
  ComponentPropsWithRef<'input'>,
  'prefix' | 'className' | 'size'
> {
  /** Fixed text before the value, e.g. "go.smilecare.vn/". It is announced with the input. */
  prefix?: ReactNode;
  /** Decorative icon inside the frame, e.g. a search glass. */
  leadingIcon?: ReactNode;
  /** Monospace value, for slugs and URLs. */
  mono?: boolean | undefined;
  /** Danger border without a Field (a Field with an error sets it automatically). */
  invalid?: boolean | undefined;
  /** Class for the frame around the input. */
  className?: string | undefined;
}

export function Input({
  prefix,
  leadingIcon,
  mono = false,
  invalid = false,
  className,
  id,
  type = 'text',
  'aria-describedby': describedBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
  ...rest
}: InputProps) {
  const field = useFieldContext();
  const prefixId = useId();
  const hasPrefix = hasContent(prefix);
  const tone = toneOf(field?.tone, invalid);
  return (
    <div className={cx(styles.control, styles[tone], mono && styles.mono, className)}>
      {leadingIcon ? (
        <span className={styles.leadingIcon} aria-hidden="true">
          {leadingIcon}
        </span>
      ) : null}
      {hasPrefix ? (
        <span id={prefixId} className={styles.prefix}>
          {prefix}
        </span>
      ) : null}
      <input
        {...rest}
        type={type}
        id={id ?? field?.control.id}
        aria-describedby={joinIds(
          hasPrefix && prefixId,
          field?.control['aria-describedby'],
          describedBy,
        )}
        aria-invalid={ariaInvalid ?? (invalid ? true : field?.control['aria-invalid'])}
        aria-required={ariaRequired ?? field?.control['aria-required']}
        className={styles.native}
      />
    </div>
  );
}
