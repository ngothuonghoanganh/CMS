import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Canvas } from './Canvas';
import { makeStore, sectionIds } from './test-fixtures';
import { renderEditor } from './test-render';

const CAPTURE = {
  requiredText: 'Tôi đồng ý để Smile Care xử lý họ tên và số điện thoại của tôi.',
  marketingText: null,
  policyUrl: 'https://smilecare.vn/chinh-sach',
};

/** The "Chạy thử" banner, beside the editor's own live region. */
function playBanner(): HTMLElement {
  const banner = screen
    .getAllByRole('status')
    .find((region) => region.textContent.includes('chạy thử'));
  if (!banner) {
    throw new Error('No play banner');
  }
  return banner;
}

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

  it('stays still while editing, and plays the page on demand without editing it (ADR-032)', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    const { container } = renderEditor(<Canvas />, { store });
    // A page without a style has nothing to play.
    expect(screen.queryByRole('button', { name: 'Chạy thử hiệu ứng' })).toBeNull();

    act(() => {
      store.getState().setMotionStyle('smooth');
    });
    expect(screen.getByText(/Section đứng yên khi chỉnh sửa/)).toBeInTheDocument();
    expect(container.querySelector('[contenteditable]')).not.toBeNull();
    // Without an IntersectionObserver (jsdom), the play ends at once, every section shown.
    await user.click(screen.getByRole('button', { name: 'Chạy thử hiệu ứng' }));
    expect(playBanner()).toHaveTextContent('Đã chạy thử xong · Cả trang · Mượt mà · mức Vừa');
    expect(container.querySelector('[contenteditable]')).toBeNull();
    expect(container.querySelectorAll('[data-motion]')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Quay lại chỉnh sửa' }));
    expect(store.getState().motionPlay.scope).toBeNull();
    expect(container.querySelector('[contenteditable]')).not.toBeNull();
  });

  it('shows everything at once when playing as a device that asks for less motion', () => {
    const store = makeStore();
    store.getState().setMotionStyle('lively');
    store.getState().setMotionReduced(true);
    store.getState().playMotion({ kind: 'page' });
    renderEditor(<Canvas />, { store });
    expect(playBanner()).toHaveTextContent('Như thiết bị bật giảm chuyển động: nội dung hiện ngay');
    expect(store.getState().motionPlay.done).toBe(true);
  });
});
