'use client';

import React, {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react';
import type { ResolvedNavigationItem } from '@payload/contracts';

export type NavigationViewPartStyles = {
  root?: CSSProperties | undefined;
  list?: CSSProperties | undefined;
  item?: CSSProperties | undefined;
  link?: CSSProperties | undefined;
  activeLink?: CSSProperties | undefined;
  mobileToggle?: CSSProperties | undefined;
  mobilePanel?: CSSProperties | undefined;
};

function navigationHref(
  href: string,
  siteSlug: string | undefined,
  customDomain: boolean | undefined,
): string {
  if (customDomain || !siteSlug || !href.startsWith('/')) return href;
  return `/${siteSlug}${href === '/' ? '' : href}`;
}

function normalizedPath(value: string | undefined): string {
  if (!value) return '/';
  const path = value.split(/[?#]/, 1)[0] || '/';
  return path.length > 1 ? path.replace(/\/$/, '') : path;
}

function renderItems(
  items: readonly ResolvedNavigationItem[],
  props: {
    partsStyle: NavigationViewPartStyles | undefined;
    siteSlug?: string | undefined;
    customDomain?: boolean | undefined;
    pagePath?: string | undefined;
  },
): ReactElement {
  return (
    <ul data-payload-part="list" style={props.partsStyle?.list}>
      {items.map((item) => {
        const href = navigationHref(item.href, props.siteSlug, props.customDomain);
        const active = normalizedPath(item.href) === normalizedPath(props.pagePath);
        return (
          <li data-payload-part="item" key={item.id} style={props.partsStyle?.item}>
            <a
              aria-current={active ? 'page' : undefined}
              data-payload-part={active ? 'activeLink' : 'link'}
              href={href}
              rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
              style={{
                ...props.partsStyle?.link,
                ...(active ? props.partsStyle?.activeLink : {}),
              }}
              target={item.openInNewTab ? '_blank' : undefined}
            >
              {item.label}
            </a>
            {item.children?.length ? renderItems(item.children, props) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function NavigationViewRuntime({
  ariaLabel,
  alignment,
  customDomain,
  id,
  items,
  mobileBehavior,
  orientation,
  pagePath,
  partsStyle,
  siteSlug,
}: {
  ariaLabel: string;
  alignment: 'left' | 'center' | 'right';
  customDomain?: boolean | undefined;
  id: string;
  items: readonly ResolvedNavigationItem[];
  mobileBehavior: 'collapse' | 'wrap' | 'stack';
  orientation: 'horizontal' | 'vertical';
  pagePath?: string | undefined;
  partsStyle?: NavigationViewPartStyles;
  siteSlug?: string | undefined;
}): ReactElement {
  const [open, setOpen] = useState(true);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const collapsible = mobileBehavior === 'collapse';

  useEffect(() => {
    if (!collapsible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open) {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [collapsible, open]);

  return (
    <nav
      aria-label={ariaLabel}
      className="payload-navigation"
      data-navigation-alignment={alignment}
      data-navigation-mobile-behavior={mobileBehavior}
      data-navigation-orientation={orientation}
      data-payload-part="root"
      style={partsStyle?.root}
    >
      {collapsible ? (
        <button
          aria-controls={`${id}-panel`}
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((current) => !current)}
          ref={buttonRef}
          data-payload-part="mobileToggle"
          style={partsStyle?.mobileToggle}
          type="button"
        >
          Menu
        </button>
      ) : null}
      <div
        data-payload-part="mobilePanel"
        id={`${id}-panel`}
        hidden={collapsible && !open}
        style={partsStyle?.mobilePanel}
      >
        {renderItems(items, { partsStyle, siteSlug, customDomain, pagePath })}
      </div>
    </nav>
  );
}
