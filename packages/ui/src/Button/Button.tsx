import type { ComponentPropsWithRef, ReactNode } from 'react';
import { Spinner } from '../Spinner/Spinner';
import { buttonClassName, buttonIconClassName, type ButtonStyleOptions } from './buttonClassName';

export interface ButtonProps
  extends Omit<ComponentPropsWithRef<'button'>, 'className'>, ButtonStyleOptions {
  /**
   * Shows a spinner and sets `aria-busy` and `aria-disabled` until the work finishes. Clicks are
   * ignored, but the button stays focusable: a natively disabled button would drop keyboard
   * focus to the page (or out of a dialog) the moment it starts loading.
   */
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
  onClick,
  children,
  ...rest
}: ButtonProps) {
  const leading = loading ? <Spinner size={16} /> : leadingIcon;
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled === true}
      aria-disabled={loading ? true : rest['aria-disabled']}
      aria-busy={loading ? true : undefined}
      onClick={
        loading
          ? (event) => {
              // Also stops a submit button from submitting its form again.
              event.preventDefault();
            }
          : onClick
      }
      className={buttonClassName({ variant, size, fullWidth, className }, loading)}
    >
      {leading ? <span className={buttonIconClassName}>{leading}</span> : null}
      {children}
      {trailingIcon ? <span className={buttonIconClassName}>{trailingIcon}</span> : null}
    </button>
  );
}
