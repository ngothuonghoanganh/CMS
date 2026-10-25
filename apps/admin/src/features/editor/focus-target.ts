import type { CheckTarget } from '@plp/contracts';
import type { EditorStore } from './store';

/** Id of the properties panel; fields inside carry `data-field-path`. */
export const PROPERTIES_PANEL_ID = 'editor-properties';

const FOCUSABLE =
  'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])';

function escapeAttribute(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

/**
 * The element of the closest field for a content path: "items.2.image.alt" falls back to
 * "items.2.image", "items.2" and "items" when the exact field is not rendered.
 */
export function findFieldElement(root: ParentNode, path: string): HTMLElement | null {
  const parts = path.split('.');
  while (parts.length > 0) {
    const selector = `[data-field-path="${escapeAttribute(parts.join('.'))}"]`;
    const element = root.querySelector<HTMLElement>(selector);
    if (element) {
      return element;
    }
    parts.pop();
  }
  return null;
}

/** Scrolls a field into view and focuses its preferred control. Returns false when not found. */
export function focusFieldElement(root: ParentNode, path: string | null): boolean {
  const field = path === null ? null : findFieldElement(root, path);
  const container = field ?? root.querySelector<HTMLElement>(`#${PROPERTIES_PANEL_ID} h2`);
  if (!container) {
    return false;
  }
  const control =
    container.querySelector<HTMLElement>('[data-field-focus]') ??
    container.querySelector<HTMLElement>(FOCUSABLE) ??
    container;
  if (typeof container.scrollIntoView === 'function') {
    container.scrollIntoView({ block: 'center' });
  }
  if (control === container && !container.hasAttribute('tabindex')) {
    container.setAttribute('tabindex', '-1');
  }
  control.focus();
  return true;
}

/**
 * Closing the properties panel removes the focused control; continue from the section's row in
 * the page structure instead of the top of the document.
 */
export function focusOutlineRow(sectionId: string): void {
  requestAnimationFrame(() => {
    const active = document.activeElement;
    if (active !== null && active !== document.body && active.isConnected) {
      return;
    }
    document.querySelector<HTMLElement>(`[data-structure-control="${sectionId}:select"]`)?.focus();
  });
}

export interface FocusTargetOptions {
  /** Pages outside the editor (SEO, slug) open through guarded navigation. */
  navigate: (href: string) => void;
  /** "/sites/{siteId}/pages/{pageId}/seo". */
  seoHref: string;
  /** "/sites/{siteId}/privacy": the consent settings a lead form needs (ADR-017). */
  privacyHref: string;
  /** Element containing the properties panel; defaults to `document`. */
  root?: ParentNode;
  /** Wait before focusing, so a closing dialog can return its focus first. */
  delayMs?: number;
}

/**
 * Takes the user to the field a publish check points at: selects the section, lets the
 * properties panel render the field (expanding its list item), then scrolls to it and focuses it.
 * SEO and slug targets open the page's SEO settings with `?focus=title|description|…|slug`;
 * missing consent settings open "Dữ liệu & đồng ý".
 */
export function focusTarget(
  store: EditorStore,
  target: CheckTarget,
  options: FocusTargetOptions,
): void {
  switch (target.kind) {
    case 'seo':
      options.navigate(`${options.seoHref}?focus=${target.field}`);
      return;
    case 'slug':
      options.navigate(`${options.seoHref}?focus=slug`);
      return;
    case 'page':
      store.getState().select(null);
      return;
    case 'privacy':
      options.navigate(options.privacyHref);
      return;
    case 'section': {
      if (!store.getState().select(target.sectionId, target.fieldPath)) {
        return;
      }
      const root = options.root ?? document;
      let attempts = 0;
      const tryFocus = () => {
        attempts += 1;
        const panel = root.querySelector(`#${PROPERTIES_PANEL_ID}`);
        if (panel && focusFieldElement(panel, target.fieldPath)) {
          return;
        }
        if (attempts < 20) {
          setTimeout(tryFocus, 25);
        }
      };
      setTimeout(tryFocus, options.delayMs ?? 50);
      return;
    }
  }
}
