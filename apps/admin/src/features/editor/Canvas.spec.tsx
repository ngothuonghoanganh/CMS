import { act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Canvas } from './Canvas';
import { makeStore, sectionIds } from './test-fixtures';
import { renderEditor } from './test-render';

const CAPTURE = {
  requiredText: 'Tôi đồng ý để Smile Care xử lý họ tên và số điện thoại của tôi.',
  marketingText: null,
  policyUrl: 'https://smilecare.vn/chinh-sach',
};

function footerOf(container: HTMLElement): HTMLElement {
  const footer = container.querySelector<HTMLElement>('footer');
  if (!footer) {
    throw new Error('The canvas draws no footer');
  }
  return footer;
}

describe('Canvas', () => {
  // Like the form, the footer shows the site's current settings: what the next publish freezes.
  it('links the privacy policy in the footer only while the page has a form', () => {
    const store = makeStore({ leadCapture: CAPTURE });
    const { container } = renderEditor(<Canvas />, { store });
    expect(footerOf(container)).not.toHaveTextContent('Chính sách quyền riêng tư');

    act(() => {
      store.getState().addSection('lead_form', undefined, 2);
    });
    expect(footerOf(container)).toHaveTextContent('Chính sách quyền riêng tư');
    // The canvas never navigates: the link is drawn, not followed.
    expect(footerOf(container).querySelector('a')).toBeNull();

    act(() => {
      store.getState().removeSection(sectionIds(store)[2] ?? '');
    });
    expect(footerOf(container)).not.toHaveTextContent('Chính sách quyền riêng tư');
  });

  it('draws no policy link while the site has no privacy settings', () => {
    const store = makeStore({ leadCapture: null });
    store.getState().addSection('lead_form', undefined, 2);
    const { container } = renderEditor(<Canvas />, { store });
    expect(footerOf(container)).not.toHaveTextContent('Chính sách quyền riêng tư');
  });
});
