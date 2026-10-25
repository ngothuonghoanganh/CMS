import type { AriaAttributes, ComponentPropsWithRef, ComponentType, ReactNode, Ref } from 'react';
import { buttonClassName, buttonIconClassName, type ButtonStyleOptions } from './buttonClassName';

/**
 * The props a link component receives from `ButtonLink`, `IconButtonLink` and `TabsNav`.
 * Framework links such as `next/link` satisfy it, so pass one through `as`.
 */
export interface LinkComponentProps {
  href: string;
  className?: string | undefined;
  children?: ReactNode;
  ref?: Ref<HTMLAnchorElement> | undefined;
  'aria-current'?: AriaAttributes['aria-current'];
}

export type LinkComponent = ComponentType<LinkComponentProps>;

function Anchor(props: ComponentPropsWithRef<'a'>) {
  return <a {...props} />;
}

/** The default link: a plain `<a>`. */
export const DefaultLink: LinkComponent = Anchor;

export interface ButtonLinkProps
  extends Omit<ComponentPropsWithRef<'a'>, 'className' | 'href'>, ButtonStyleOptions {
  href: string;
  /** Link component used to render the anchor, e.g. `next/link`. Defaults to `<a>`. */
  as?: LinkComponent | undefined;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

/** A link styled as a button, for navigation such as "Tạo trang" or "Mở editor". */
export function ButtonLink({
  as: Link = DefaultLink,
  variant,
  size,
  fullWidth,
  className,
  leadingIcon,
  trailingIcon,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link {...rest} className={buttonClassName({ variant, size, fullWidth, className })}>
      {leadingIcon ? <span className={buttonIconClassName}>{leadingIcon}</span> : null}
      {children}
      {trailingIcon ? <span className={buttonIconClassName}>{trailingIcon}</span> : null}
    </Link>
  );
}
