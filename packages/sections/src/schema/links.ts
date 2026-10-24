import type { Cta, Link } from '@plp/contracts';

function digitsOf(phone: string): string {
  return phone.replace(/[^0-9+]/g, '');
}

/** A link with every value it needs; incomplete links render as plain text and fail publish checks. */
export function isLinkComplete(link: Link): boolean {
  switch (link.kind) {
    case 'none':
      return false;
    case 'section':
      return link.sectionId !== '';
    case 'page':
      return true;
    case 'url':
      return link.url !== '';
    case 'phone':
    case 'zalo':
      return digitsOf(link.phone).length >= 3;
  }
}

/** True when a button is in use: it has a label. An unused optional button is not rendered. */
export function isCtaUsed(cta: Cta): boolean {
  return cta.label.trim() !== '';
}

/**
 * The href of a link on a rendered page, or null when it cannot lead anywhere (missing section,
 * page not live, empty value). `pagePaths` maps page ids to their live path ("/", "/uu-dai").
 */
export function linkHref(
  link: Link,
  pagePaths: Readonly<Record<string, string | null>>,
): string | null {
  switch (link.kind) {
    case 'none':
      return null;
    case 'section':
      return link.sectionId === '' ? null : `#section-${link.sectionId}`;
    case 'page':
      return pagePaths[link.pageId] ?? null;
    case 'url':
      return link.url === '' ? null : link.url;
    case 'phone': {
      const digits = digitsOf(link.phone);
      return digits === '' ? null : `tel:${digits}`;
    }
    case 'zalo': {
      const digits = digitsOf(link.phone).replace(/^\+/, '');
      return digits === '' ? null : `https://zalo.me/${digits}`;
    }
  }
}

export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}
