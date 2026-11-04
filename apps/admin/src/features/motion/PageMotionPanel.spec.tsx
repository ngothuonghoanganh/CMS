import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeStore, pageDetail } from '../editor/test-fixtures';
import { renderEditor } from '../editor/test-render';
import { PageMotionPanel } from './PageMotionPanel';

function styleButton(name: RegExp) {
  return within(screen.getByRole('group', { name: 'Phong cách chuyển động' })).getByRole('button', {
    name,
  });
}

describe('PageMotionPanel (board 37, ADR-032)', () => {
  it('starts a new page without motion, and sets a style as one undo step', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    renderEditor(<PageMotionPanel />, { store });
    expect(styleButton(/^Không hiệu ứng/)).toHaveAttribute('aria-pressed', 'true');
    expect(styleButton(/^Không hiệu ứng/)).toHaveTextContent('Mặc định');
    expect(screen.getByText('Chọn một phong cách để chỉnh mức độ và điểm nhấn.')).toBeVisible();

    await user.click(styleButton(/^Mượt mà/));
    expect(store.getState().draft.composition.motion?.style).toBe('smooth');
    expect(store.getState().history.past).toHaveLength(1);
    expect(styleButton(/^Mượt mà/)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Section trượt lên, các phần hiện lần lượt/)).toBeVisible();
    expect(screen.getByText('Đã chọn phong cách Mượt mà.')).toBeInTheDocument();
  });

  it('changes the level, the accents and phones through the store', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store.getState().setMotionStyle('smooth');
    renderEditor(<PageMotionPanel />, { store });

    await user.click(screen.getByRole('button', { name: 'Rõ' }));
    expect(store.getState().draft.composition.motion?.level).toBe('high');

    const lines = screen.getByRole('switch', { name: 'Tiêu đề hiện từng dòng' });
    expect(lines).toBeChecked();
    expect(lines).toHaveAccessibleDescription(/theo phong cách$/);
    await user.click(lines);
    expect(store.getState().draft.composition.motion?.accents).toEqual({ lines: false });
    expect(
      screen.getByRole('switch', { name: 'Tiêu đề hiện từng dòng' }),
    ).toHaveAccessibleDescription(/đã chỉnh$/);

    await user.click(screen.getByRole('switch', { name: 'Giảm chuyển động trên điện thoại' }));
    expect(store.getState().draft.composition.motion?.reduceOnMobile).toBe(true);

    await user.click(screen.getByRole('button', { name: 'TÙY CHỈNH THÊM' }));
    expect(screen.queryByRole('switch', { name: 'Tiêu đề hiện từng dòng' })).toBeNull();
  });

  it('plays the page, slower or as with reduced motion, without changing the draft', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store.getState().setMotionStyle('lively');
    renderEditor(<PageMotionPanel />, { store });
    await user.click(screen.getByRole('checkbox', { name: 'Xem chậm (¼ tốc độ)' }));
    await user.click(screen.getByRole('checkbox', { name: 'Như thiết bị bật giảm chuyển động' }));
    await user.click(screen.getByRole('button', { name: 'Chạy thử hiệu ứng' }));
    expect(store.getState().motionPlay).toMatchObject({
      scope: { kind: 'page' },
      slow: true,
      reduced: true,
    });
    expect(store.getState().history.past).toHaveLength(1);
  });

  it('opens the library and the first section that may move', async () => {
    const user = userEvent.setup();
    const openMotionLibrary = vi.fn();
    const store = makeStore();
    renderEditor(<PageMotionPanel />, { store, services: { openMotionLibrary } });
    await user.click(screen.getByRole('button', { name: 'So sánh' }));
    expect(openMotionLibrary).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Chỉnh riêng cho từng section' }));
    // The navigation bar and the Hero always show at once: the benefits come first.
    expect(store.getState().selection.sectionId).toBe('benefits0001');
  });

  it('names the template’s style and the styles of its industry, and turns it off and on', async () => {
    const user = userEvent.setup();
    const store = makeStore({
      detail: {
        ...pageDetail(),
        createdFrom: { source: 'system', templateId: 'nha-khoa-uu-dai', version: 2 },
      },
    });
    store.getState().setMotionStyle('smooth');
    renderEditor(<PageMotionPanel />, { store });
    expect(styleButton(/^Tinh tế/)).toHaveTextContent('Hợp ngành');
    expect(styleButton(/^Mượt mà/)).toHaveTextContent('Hợp ngành');
    expect(styleButton(/^Năng động/)).not.toHaveTextContent('Hợp ngành');
    expect(
      screen.getByText('Template đã dùng chọn sẵn phong cách Mượt mà. Bạn có thể đổi hoặc tắt.'),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Tắt toàn bộ hiệu ứng' }));
    expect(store.getState().draft.composition.motion).toBeUndefined();
    expect(screen.getByText('Đã tắt toàn bộ chuyển động mà template chọn sẵn.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Dùng lại phong cách của template' }));
    expect(store.getState().draft.composition.motion?.style).toBe('smooth');
  });
});
