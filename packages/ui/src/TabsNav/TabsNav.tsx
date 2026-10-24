import type { ReactNode } from 'react';
import { DefaultLink, type LinkComponent } from '../Button/ButtonLink';
import { cx } from '../internal/cx';
import styles from './TabsNav.module.css';

export interface TabsNavItem {
  href: string;
  label: ReactNode;
  /** The page this link points to is the one being shown. */
  current?: boolean | undefined;
}

export interface TabsNavProps {
  /** Name of the navigation landmark, e.g. "Mục của trang". */
  'aria-label': string;
  items: ReadonlyArray<TabsNavItem>;
  /** Link component, e.g. `next/link`. Defaults to `<a>`. */
  as?: LinkComponent | undefined;
  className?: string | undefined;
}

/**
 * Page-level navigation that looks like tabs ("Nội dung", "SEO & chia sẻ", "Lịch sử phiên bản").
 * Each item is a real link; the current one has `aria-current="page"`.
 */
export function TabsNav({
  'aria-label': ariaLabel,
  items,
  as: Link = DefaultLink,
  className,
}: TabsNavProps) {
  return (
    <nav aria-label={ariaLabel} className={cx(styles.nav, className)}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.current === true ? 'page' : undefined}
          className={cx(styles.link, item.current === true && styles.current)}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
