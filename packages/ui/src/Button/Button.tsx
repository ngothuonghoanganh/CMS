import type { ComponentPropsWithRef, ReactNode } from 'react';
import { Spinner } from '../Spinner/Spinner';
import { buttonClassName, buttonIconClassName, type ButtonStyleOptions } from './buttonClassName';

export interface ButtonProps
  extends Omit<ComponentPropsWithRef<'button'>, 'className'>, ButtonStyleOptions {
  /** Shows a spinner, sets `aria-busy` and disables the button until the work finishes. */
  loading?: boolean | undefined;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

export function Button({
  variant,
  size,
  fullWidth,
  className,
  loading = false,
  leadingIcon,
  trailingIcon,
  disabled,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const leading = loading ? <Spinner size={16} /> : leadingIcon;
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled === true || loading}
      aria-busy={loading ? true : undefined}
      className={buttonClassName({ variant, size, fullWidth, className }, loading)}
    >
      {leading ? <span className={buttonIconClassName}>{leading}</span> : null}
      {children}
      {trailingIcon ? <span className={buttonIconClassName}>{trailingIcon}</span> : null}
    </button>
  );
}
