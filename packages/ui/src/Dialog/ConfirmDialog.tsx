'use client';

import { AlertDialog as RadixAlertDialog } from 'radix-ui';
import { type ReactElement, type ReactNode, type RefObject, useId, useRef, useState } from 'react';
import { Button } from '../Button/Button';
import { Callout } from '../Callout/Callout';
import { Field } from '../Field/Field';
import { Textarea } from '../Field/Textarea';
import { cx } from '../internal/cx';
import { hasContent } from '../internal/hasContent';
import { useReturnFocus } from './useReturnFocus';
import styles from './Dialog.module.css';

export interface ConfirmReasonOptions {
  /** Defaults to "Lý do". */
  label?: string | undefined;
  /** Muted note after the label. Defaults to "ghi vào nhật ký hoạt động". */
  labelNote?: string | undefined;
  placeholder?: string | undefined;
  /** Hard limit; shows a counter. */
  maxLength?: number | undefined;
}

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Element that opens the dialog; it receives focus again on close. */
  trigger?: ReactElement | undefined;
  /**
   * Element to focus when the dialog closes and the element that opened it no longer exists, e.g.
   * the confirmed action removed it. Focus otherwise returns to the opener (for a menu item, to
   * its menu's trigger).
   */
  fallbackFocusRef?: RefObject<HTMLElement | null> | undefined;
  title: ReactNode;
  description?: ReactNode;
  /** Extra explanation under the description, e.g. what stays unchanged. */
  children?: ReactNode;
  confirmLabel: string;
  /** Defaults to "Hủy". */
  cancelLabel?: string | undefined;
  /** `danger` for destructive actions. Defaults to `default`. */
  tone?: 'default' | 'danger' | undefined;
  /**
   * Requires a reason before confirming (rollback, unpublish). The trimmed reason is passed to
   * `onConfirm`; confirming stays disabled while it is empty.
   */
  reason?: ConfirmReasonOptions | undefined;
  /** The action is running: confirm shows a spinner and the dialog cannot be dismissed. */
  pending?: boolean | undefined;
  /** Actionable error from the last attempt, shown above the buttons. */
  error?: ReactNode;
  /** Called with the trimmed reason (empty string without `reason`). Close the dialog yourself. */
  onConfirm: (reason: string) => void;
}

interface ConfirmBodyProps {
  props: ConfirmDialogProps;
  reasonRef: RefObject<HTMLTextAreaElement | null>;
}

function ConfirmBody({ props, reasonRef }: ConfirmBodyProps) {
  const { reason, pending = false, error, tone = 'default', confirmLabel, onConfirm } = props;
  const [reasonText, setReasonText] = useState('');
  const hintId = useId();
  const trimmed = reasonText.trim();
  const missingReason = reason !== undefined && trimmed === '';
  const hasError = hasContent(error);
  const hasExtra = hasContent(props.children);
  return (
    <>
      {hasExtra || reason || hasError ? (
        <div className={styles.body}>
          <div className={styles.confirmStack}>
            {props.children}
            {reason ? (
              <Field
                label={reason.label ?? 'Lý do'}
                labelNote={reason.labelNote ?? 'ghi vào nhật ký hoạt động'}
                required
                counter={
                  reason.maxLength === undefined
                    ? undefined
                    : { length: reasonText.length, max: reason.maxLength }
                }
              >
                <Textarea
                  ref={reasonRef}
                  rows={3}
                  value={reasonText}
                  placeholder={reason.placeholder}
                  maxLength={reason.maxLength}
                  disabled={pending}
                  onChange={(event) => {
                    setReasonText(event.target.value);
                  }}
                />
              </Field>
            ) : null}
            {hasError ? (
              <Callout tone="danger" role="alert">
                {error}
              </Callout>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className={styles.footer}>
        {missingReason ? (
          <span id={hintId} className={styles.footerHint}>
            Nhập lý do để tiếp tục.
          </span>
        ) : null}
        <div className={styles.footerActions}>
          <RadixAlertDialog.Cancel asChild>
            <Button variant="secondary" disabled={pending}>
              {props.cancelLabel ?? 'Hủy'}
            </Button>
          </RadixAlertDialog.Cancel>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={pending}
            disabled={missingReason}
            aria-describedby={missingReason ? hintId : undefined}
            onClick={() => {
              onConfirm(reason ? trimmed : '');
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </>
  );
}

/**
 * Confirmation for consequential actions (rollback, unpublish, replace the draft). Escape and
 * "Hủy" cancel; clicking outside does nothing. Focus starts on the reason field when one is
 * required, otherwise on "Hủy".
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const {
    open,
    onOpenChange,
    trigger,
    fallbackFocusRef,
    title,
    description,
    reason,
    pending = false,
  } = props;
  const focus = useReturnFocus(fallbackFocusRef);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const hasDescription = hasContent(description);
  return (
    <RadixAlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        // A running action cannot be dismissed half-way.
        if (!next && pending) {
          return;
        }
        onOpenChange(next);
      }}
    >
      {trigger ? <RadixAlertDialog.Trigger asChild>{trigger}</RadixAlertDialog.Trigger> : null}
      <RadixAlertDialog.Portal>
        <RadixAlertDialog.Overlay className={styles.overlay} />
        <RadixAlertDialog.Content
          className={cx(styles.content, styles.sm)}
          {...(hasDescription ? {} : { 'aria-describedby': undefined })}
          onOpenAutoFocus={(event) => {
            focus.rememberFocus();
            if (reason && reasonRef.current) {
              event.preventDefault();
              reasonRef.current.focus();
            }
          }}
          onCloseAutoFocus={focus.restoreFocus}
        >
          <div className={styles.header}>
            <div className={styles.heading}>
              <RadixAlertDialog.Title className={styles.title}>{title}</RadixAlertDialog.Title>
              {hasDescription ? (
                <RadixAlertDialog.Description className={styles.description}>
                  {description}
                </RadixAlertDialog.Description>
              ) : null}
            </div>
          </div>
          <ConfirmBody props={props} reasonRef={reasonRef} />
        </RadixAlertDialog.Content>
      </RadixAlertDialog.Portal>
    </RadixAlertDialog.Root>
  );
}
