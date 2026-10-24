import type { ComponentPropsWithRef, ReactNode } from 'react';
import { AlertCircleIcon, CheckIcon, InfoCircleIcon, WarningTriangleIcon } from '../icons';
import { cx } from '../internal/cx';
import { hasContent } from '../internal/hasContent';
import styles from './Callout.module.css';

export type CalloutTone = 'info' | 'warning' | 'danger' | 'success';

export interface CalloutProps extends Omit<ComponentPropsWithRef<'div'>, 'title' | 'className'> {
  /** Defaults to `info`. */
  tone?: CalloutTone | undefined;
  title?: ReactNode;
  /** Replaces the tone icon; `false` shows none. */
  icon?: ReactNode;
  /** Buttons or links on the right, e.g. "Sửa ngay". */
  action?: ReactNode;
  /** `panel` is a rounded box; `banner` is a full-width strip (the editor draft notice). */
  variant?: 'panel' | 'banner' | undefined;
  className?: string | undefined;
}

const toneIcons: Record<CalloutTone, ReactNode> = {
  info: <InfoCircleIcon size={18} />,
  warning: <WarningTriangleIcon size={18} strokeWidth={2} />,
  danger: <AlertCircleIcon size={18} strokeWidth={2} />,
  success: <CheckIcon size={18} strokeWidth={2.2} />,
};

/**
 * Inline message such as "Thiết lập SEO thuộc bản nháp…" or a publish check. Pass `role="status"`
 * or `role="alert"` when the message appears in response to an action.
 */
export function Callout({
  tone = 'info',
  title,
  icon,
  action,
  variant = 'panel',
  className,
  children,
  ...rest
}: CalloutProps) {
  const shownIcon = icon === undefined ? toneIcons[tone] : icon;
  const hasTitle = hasContent(title);
  const hasBody = hasContent(children);
  return (
    <div
      {...rest}
      className={cx(styles.callout, styles[tone], styles[variant], className)}
      data-tone={tone}
    >
      {shownIcon === false || shownIcon === null ? null : (
        <span className={styles.icon} aria-hidden="true">
          {shownIcon}
        </span>
      )}
      <div className={styles.content}>
        {hasTitle ? <p className={styles.title}>{title}</p> : null}
        {hasBody ? <div className={styles.body}>{children}</div> : null}
      </div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
