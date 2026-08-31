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

function NavigationMenuItem({
  item,
  depth,
  partsStyle,
  siteSlug,
  customDomain,
  pagePath,
}: {
  item: ResolvedNavigationItem;
  depth: number;
  partsStyle: NavigationViewPartStyles | undefined;
  siteSlug?: string | undefined;
  customDomain?: boolean | undefined;
  pagePath?: string | undefined;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const itemRef = useRef<HTMLLIElement>(null);
  const submenuToggleRef = useRef<HTMLButtonElement>(null);
  const href = navigationHref(item.href, siteSlug, customDomain);
  const active = normalizedPath(item.href) === normalizedPath(pagePath);
  const hasChildren = Boolean(item.children?.length);
  const submenuId = `navigation-submenu-${item.id}`;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        submenuToggleRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !itemRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <li
      data-navigation-depth={depth}
      data-payload-part="item"
      onMouseEnter={() => hasChildren && setOpen(true)}
      onMouseLeave={() => {
        if (!itemRef.current?.contains(document.activeElement)) setOpen(false);
      }}
      ref={itemRef}
      style={partsStyle?.item}
    >
      <span className="payload-navigation-item-control">
        <a
          aria-current={active ? 'page' : undefined}
          data-payload-part={active ? 'activeLink' : 'link'}
          href={href}
          onKeyDown={(event) => {
            if (
              hasChildren &&
              (event.key === 'ArrowDown' || event.key === 'ArrowRight')
            ) {
              event.preventDefault();
              setOpen(true);
              submenuToggleRef.current?.focus();
            }
          }}
          rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
          role="menuitem"
          style={{
            ...partsStyle?.link,
            ...(active ? partsStyle?.activeLink : {}),
          }}
          target={item.openInNewTab ? '_blank' : undefined}
        >
          {item.label}
        </a>
        {hasChildren ? (
          <button
            aria-controls={submenuId}
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label={`${open ? 'Close' : 'Open'} ${item.label} submenu`}
            className="payload-navigation-submenu-toggle"
            onClick={() => setOpen((current) => !current)}
            ref={submenuToggleRef}
            type="button"
          >
            <span aria-hidden="true">▾</span>
          </button>
        ) : null}
      </span>
      {hasChildren ? (
        <ul
          aria-label={`${item.label} submenu`}
          data-payload-part="list"
          id={submenuId}
          hidden={!open}
          role="menu"
        >
          {item.children!.map((child) => (
            <NavigationMenuItem
              customDomain={customDomain}
              depth={depth + 1}
              item={child}
              key={child.id}
              pagePath={pagePath}
              partsStyle={partsStyle}
              siteSlug={siteSlug}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
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
      {items.map((item) => (
        <NavigationMenuItem
          customDomain={props.customDomain}
          depth={0}
          item={item}
          key={item.id}
          pagePath={props.pagePath}
          partsStyle={props.partsStyle}
          siteSlug={props.siteSlug}
        />
      ))}
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
