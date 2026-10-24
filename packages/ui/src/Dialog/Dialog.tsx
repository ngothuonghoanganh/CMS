'use client';

import { Dialog as RadixDialog } from 'radix-ui';
import type { ReactElement, ReactNode, RefObject } from 'react';
import { IconButton } from '../IconButton/IconButton';
import { CloseIcon } from '../icons';
import { cx } from '../internal/cx';
import { hasContent } from '../internal/hasContent';
import { useReturnFocus } from './useReturnFocus';
import styles from './Dialog.module.css';

export type DialogSize = 'md' | 'lg';

export interface DialogProps {
  open?: boolean | undefined;
  defaultOpen?: boolean | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  /** Element that opens the dialog; it receives focus again on close. */
  trigger?: ReactElement | undefined;
  title: ReactNode;
  /** Short subtitle, announced as the dialog description (inline content only). */
  description?: ReactNode;
  /** Controls next to the title, e.g. the section search in "Thêm section". */
  headerActions?: ReactNode;
  /** Body. */
  children?: ReactNode;
  /** Actions on the right of the footer. */
  footer?: ReactNode;
  /** Note on the left of the footer, e.g. "Bản v12 vẫn được lưu…". */
  footerStart?: ReactNode;
  /** `md` is 560px wide, `lg` is 1060px ("Thêm section"). Defaults to `md`. */
  size?: DialogSize | undefined;
  /** Remove the body padding when the body lays out its own panes. */
  flush?: boolean | undefined;
  /** Element to focus when the dialog opens. Defaults to the first focusable element. */
  initialFocusRef?: RefObject<HTMLElement | null> | undefined;
  /** Accessible name of the close button. Defaults to "Đóng". */
  closeLabel?: string | undefined;
  className?: string | undefined;
}

/** Modal dialog: focus is trapped, Escape and the close button close it, focus returns on close. */
export function Dialog({
  open,
  defaultOpen,
  onOpenChange,
  trigger,
  title,
  description,
  headerActions,
  children,
  footer,
  footerStart,
  size = 'md',
  flush = false,
  initialFocusRef,
  closeLabel = 'Đóng',
  className,
}: DialogProps) {
  const focus = useReturnFocus();
  const hasDescription = hasContent(description);
  const hasFooter = hasContent(footer) || hasContent(footerStart);
  return (
    <RadixDialog.Root
      {...(open === undefined ? {} : { open })}
      {...(defaultOpen === undefined ? {} : { defaultOpen })}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
    >
      {trigger ? <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger> : null}
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={styles.overlay} />
        <RadixDialog.Content
          className={cx(styles.content, styles[size], className)}
          {...(hasDescription ? {} : { 'aria-describedby': undefined })}
          onOpenAutoFocus={(event) => {
            focus.rememberFocus();
            const target = initialFocusRef?.current;
            if (target) {
              event.preventDefault();
              target.focus();
            }
          }}
          onCloseAutoFocus={focus.restoreFocus}
        >
          <div className={styles.header}>
            <div className={styles.heading}>
              <RadixDialog.Title className={styles.title}>{title}</RadixDialog.Title>
              {hasDescription ? (
                <RadixDialog.Description className={styles.description}>
                  {description}
                </RadixDialog.Description>
              ) : null}
            </div>
            {hasContent(headerActions) ? (
              <div className={styles.headerActions}>{headerActions}</div>
            ) : null}
            <RadixDialog.Close asChild>
              <IconButton aria-label={closeLabel} icon={<CloseIcon />} size="sm" />
            </RadixDialog.Close>
          </div>
          <div className={cx(styles.body, flush && styles.flush)}>{children}</div>
          {hasFooter ? (
            <div className={styles.footer}>
              {hasContent(footerStart) ? (
                <div className={styles.footerStart}>{footerStart}</div>
              ) : null}
              {hasContent(footer) ? <div className={styles.footerActions}>{footer}</div> : null}
            </div>
          ) : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
