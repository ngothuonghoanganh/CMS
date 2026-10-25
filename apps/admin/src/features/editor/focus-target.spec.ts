import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  findFieldElement,
  focusFieldElement,
  focusTarget,
  PROPERTIES_PANEL_ID,
} from './focus-target';
import { makeStore } from './test-fixtures';

const SEO_HREF = '/sites/s/pages/p/seo';
const PRIVACY_HREF = '/sites/s/privacy';

function panel(html: string): HTMLElement {
  const root = document.createElement('aside');
  root.id = PROPERTIES_PANEL_ID;
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('focus target', () => {
  it('finds the closest rendered field of a path', () => {
    const root = panel(`
      <div data-field-path="items"><div data-field-path="items.2"><input id="title" /></div></div>
    `);
    expect(findFieldElement(root, 'items.2.title')?.dataset.fieldPath).toBe('items.2');
    expect(findFieldElement(root, 'items.0.title')?.dataset.fieldPath).toBe('items');
    expect(findFieldElement(root, 'heading')).toBeNull();
  });

  it('focuses the preferred control of a field', () => {
    const root = panel(`
      <fieldset data-field-path="image">
        <button type="button">Thay ảnh</button>
        <input id="alt" data-field-focus />
      </fieldset>
    `);
    expect(focusFieldElement(root, 'image')).toBe(true);
    expect(document.activeElement?.id).toBe('alt');
  });

  it('selects the section and focuses the field once the panel shows it', () => {
    vi.useFakeTimers();
    const store = makeStore();
    focusTarget(
      store,
      { kind: 'section', sectionId: 'hero00000001', fieldPath: 'heading' },
      { navigate: vi.fn(), seoHref: SEO_HREF, privacyHref: PRIVACY_HREF },
    );
    expect(store.getState().selection).toEqual({
      sectionId: 'hero00000001',
      fieldPath: 'heading',
    });
    vi.advanceTimersByTime(50);
    panel('<div data-field-path="heading"><input id="heading" /></div>');
    vi.advanceTimersByTime(25);
    expect(document.activeElement?.id).toBe('heading');
  });

  it('opens the SEO settings for SEO and slug targets', () => {
    const navigate = vi.fn();
    const store = makeStore();
    focusTarget(
      store,
      { kind: 'seo', field: 'description' },
      { navigate, seoHref: SEO_HREF, privacyHref: PRIVACY_HREF },
    );
    expect(navigate).toHaveBeenLastCalledWith(`${SEO_HREF}?focus=description`);
    focusTarget(
      store,
      { kind: 'slug' },
      { navigate, seoHref: SEO_HREF, privacyHref: PRIVACY_HREF },
    );
    expect(navigate).toHaveBeenLastCalledWith(`${SEO_HREF}?focus=slug`);
  });

  it('opens "Dữ liệu & đồng ý" when a form misses its consent settings', () => {
    const navigate = vi.fn();
    focusTarget(
      makeStore(),
      { kind: 'privacy', sectionId: 'form00000001' },
      { navigate, seoHref: SEO_HREF, privacyHref: PRIVACY_HREF },
    );
    expect(navigate).toHaveBeenCalledWith(PRIVACY_HREF);
  });
});
