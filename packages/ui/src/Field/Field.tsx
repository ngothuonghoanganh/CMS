'use client';

import { type ReactNode, useId } from 'react';
import { AlertCircleIcon, WarningTriangleIcon } from '../icons';
import { cx } from '../internal/cx';
import { hasContent } from '../internal/hasContent';
import {
  FieldContext,
  type FieldContextValue,
  type FieldControlProps,
  type FieldTone,
  joinIds,
} from './FieldContext';
import styles from './Field.module.css';

export interface FieldCounter {
  /** Current number of characters. */
  length: number;
  /** Hard limit: above it the counter turns danger. */
  max: number;
  /**
   * Recommended limit (e.g. 60 for an SEO title): above it the counter turns warning. When set, the
   * counter shows `length / softMax`; otherwise `length / max`.
   */
  softMax?: number | undefined;
}

export interface FieldProps {
  label: ReactNode;
  /** Keep the label for assistive technology only (e.g. a search box with a visible icon). */
  hideLabel?: boolean | undefined;
  /** Adds the "· tùy chọn" marker after the label. */
  optional?: boolean | undefined;
  /** Muted note after the label, e.g. "ghi vào nhật ký hoạt động". */
  labelNote?: ReactNode;
  /** Marks the control `aria-required`. */
  required?: boolean | undefined;
  help?: ReactNode;
  /** Non-blocking problem, e.g. "Cảnh báo: chưa có mô tả ảnh". */
  warning?: ReactNode;
  /** Blocking problem; marks the control `aria-invalid`. */
  error?: ReactNode;
  counter?: FieldCounter | undefined;
  /**
   * The error, warning and help change while the user types, e.g. when an availability check
   * answers: they then sit in one persistent polite live region, so assistive technology announces
   * them as status messages (WCAG 4.1.3) without a second copy of the text.
   */
  announceMessages?: boolean | undefined;
  /** Id for the control. Generated when omitted. */
  id?: string | undefined;
  className?: string | undefined;
  /**
   * The control. `Input`, `Textarea` and `Select` wire themselves through context; any other
   * control can use the render prop and spread the props it receives.
   */
  children: ReactNode | ((control: FieldControlProps) => ReactNode);
}

function counterTone(counter: FieldCounter): FieldTone {
  if (counter.length > counter.max) {
    return 'danger';
  }
  if (counter.softMax !== undefined && counter.length > counter.softMax) {
    return 'warning';
  }
  return 'default';
}

export function Field({
  label,
  hideLabel = false,
  optional = false,
  labelNote,
  required = false,
  help,
  warning,
  error,
  counter,
  announceMessages = false,
  id,
  className,
  children,
}: FieldProps) {
  const baseId = useId();
  const controlId = id ?? `${baseId}-control`;
  const helpId = `${baseId}-help`;
  const warningId = `${baseId}-warning`;
  const errorId = `${baseId}-error`;
  const counterId = `${baseId}-counter`;

  const hasError = hasContent(error);
  const hasWarning = hasContent(warning);
  const hasHelp = hasContent(help);

  const control: FieldControlProps = {
    id: controlId,
    'aria-describedby': joinIds(
      hasError && errorId,
      hasWarning && warningId,
      hasHelp && helpId,
      counter !== undefined && counterId,
    ),
    'aria-invalid': hasError ? true : undefined,
    'aria-required': required ? true : undefined,
  };
  const tone: FieldTone = hasError ? 'danger' : hasWarning ? 'warning' : 'default';
  const context: FieldContextValue = { control, tone };
  const counterState = counter === undefined ? undefined : counterTone(counter);

  const messages = (
    <>
      {hasError ? (
        <p id={errorId} className={cx(styles.message, styles.error)}>
          <AlertCircleIcon size={14} strokeWidth={2} className={styles.messageIcon} />
          <span>{error}</span>
        </p>
      ) : null}
      {hasWarning ? (
        <p id={warningId} className={cx(styles.message, styles.warning)}>
          <WarningTriangleIcon size={14} strokeWidth={2} className={styles.messageIcon} />
          <span>{warning}</span>
        </p>
      ) : null}
      {hasHelp ? (
        <p id={helpId} className={styles.help}>
          {help}
        </p>
      ) : null}
    </>
  );

  return (
    <div className={cx(styles.field, className)}>
      <div className={cx(styles.labelRow, hideLabel && styles.labelRowHidden)}>
        <label htmlFor={controlId} className={cx(styles.label, hideLabel && styles.visuallyHidden)}>
          {label}
          {optional ? (
            <>
              {' '}
              <span className={styles.note}>· tùy chọn</span>
            </>
          ) : null}
          {hasContent(labelNote) ? (
            <>
              {' '}
              <span className={styles.note}>· {labelNote}</span>
            </>
          ) : null}
        </label>
        {counter !== undefined && counterState !== undefined ? (
          <span
            id={counterId}
            className={cx(styles.counter, styles[`counter-${counterState}`])}
            data-tone={counterState}
          >
            {counter.length} / {counter.softMax ?? counter.max}
          </span>
        ) : null}
      </div>
      <FieldContext.Provider value={context}>
        {typeof children === 'function' ? children(control) : children}
      </FieldContext.Provider>
      {announceMessages ? (
        <div aria-live="polite" className={styles.messages}>
          {messages}
        </div>
      ) : (
        messages
      )}
    </div>
  );
}
