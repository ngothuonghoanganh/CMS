import type { ComponentPropsWithRef, ReactElement, ReactNode } from 'react';
import { DefaultLink, type LinkComponent } from '../Button/ButtonLink';
import { cx } from '../internal/cx';
import { Tooltip } from '../Tooltip/Tooltip';
import styles from './IconButton.module.css';

export type IconButtonVariant = 'ghost' | 'secondary' | 'danger';
export type IconButtonSize = 'md' | 'sm';

interface IconButtonOwnProps {
  /** Required: an icon-only control is named only by its label. */
  'aria-label': string;
  icon: ReactNode;
  /** Optional hint on hover and focus, e.g. "Hoàn tác (Ctrl+Z)". */
  tooltip?: string | undefined;
  /** Defaults to `ghost`. `danger` is a ghost button in the danger color (delete). */
  variant?: IconButtonVariant | undefined;
  /** `md` is 44 × 44, `sm` is 40 × 40. Defaults to `md`. */
  size?: IconButtonSize | undefined;
  className?: string | undefined;
}

export interface IconButtonProps
  extends
    Omit<ComponentPropsWithRef<'button'>, 'aria-label' | 'children' | 'className'>,
    IconButtonOwnProps {}

function iconButtonClassName(
  variant: IconButtonVariant,
  size: IconButtonSize,
  className: string | undefined,
): string {
  return cx(styles.root, styles[variant], styles[size], className);
}

function withTooltip(control: ReactElement, tooltip: string | undefined): ReactElement {
  return tooltip ? <Tooltip content={tooltip}>{control}</Tooltip> : control;
}

export function IconButton({
  icon,
  tooltip,
  variant = 'ghost',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  const control = (
    <button {...rest} type={type} className={iconButtonClassName(variant, size, className)}>
      {icon}
    </button>
  );
  return withTooltip(control, tooltip);
}

export interface IconButtonLinkProps
  extends
    Omit<ComponentPropsWithRef<'a'>, 'aria-label' | 'children' | 'className' | 'href'>,
    IconButtonOwnProps {
  href: string;
  /** Link component, e.g. `next/link`. Defaults to `<a>`. */
  as?: LinkComponent | undefined;
}

/** An icon-only link with the IconButton look, e.g. "Lịch sử phiên bản" in the editor top bar. */
export function IconButtonLink({
  as: Link = DefaultLink,
  icon,
  tooltip,
  variant = 'ghost',
  size = 'md',
  className,
  ...rest
}: IconButtonLinkProps) {
  const control = (
    <Link {...rest} className={iconButtonClassName(variant, size, className)}>
      {icon}
    </Link>
  );
  return withTooltip(control, tooltip);
}
