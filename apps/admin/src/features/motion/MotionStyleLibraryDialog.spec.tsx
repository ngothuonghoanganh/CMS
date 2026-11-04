import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeStore } from '../editor/test-fixtures';
import { renderEditor } from '../editor/test-render';
import { MotionStyleLibraryDialog } from './MotionStyleLibraryDialog';

function card(name: string): HTMLElement {
  const heading = screen.getByRole('heading', { name, level: 3 });
  const item = heading.closest('li');
  if (!item) {
    throw new Error(`No card for ${name}`);
  }
  return item;
}

describe('MotionStyleLibraryDialog (board 39, ADR-032)', () => {
  it('compares the six styles and applies the one chosen as one undo step', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const store = makeStore();
    store.getState().setMotionStyle('smooth');
    renderEditor(<MotionStyleLibraryDialog open onOpenChange={onOpenChange} />, { store });
    const dialog = screen.getByRole('dialog', { name: 'Phong cách chuyển động' });
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(6);
    expect(card('Mượt mà')).toHaveTextContent('Đang dùng');
    expect(card('Không hiệu ứng')).toHaveTextContent('Mặc định cho trang mới');
    expect(card('Sang trọng')).toHaveTextContent('Hé lộ chậm');
    expect(card('Sang trọng')).toHaveTextContent('Tiêu đề hiện từng dòng, ảnh hé lộ');
    expect(screen.getByText('Đang dùng Mượt mà', { selector: 'p' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Đang dùng Mượt mà' })).toBeDisabled();

    await user.click(within(card('Sang trọng')).getByRole('button', { name: 'Chọn Sang trọng' }));
    expect(screen.getByText('Đổi từ Mượt mà sang Sang trọng')).toBeVisible();
    // Each card has "Xem thử" and "Chọn"; the chosen card's button turns into "Đã chọn".
    expect(
      within(card('Sang trọng')).getByRole('button', { name: 'Đã chọn Sang trọng' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(card('Mượt mà')).getByRole('button', { name: 'Xem thử Mượt mà' }),
    ).toBeInTheDocument();
    // Choosing is not applying: the draft only changes on "Áp dụng".
    expect(store.getState().draft.composition.motion?.style).toBe('smooth');
    await user.click(screen.getByRole('button', { name: 'Áp dụng Sang trọng' }));
    expect(store.getState().draft.composition.motion?.style).toBe('luxe');
    expect(store.getState().history.past).toHaveLength(2);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('previews at another level without changing the page’s', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store.getState().setMotionStyle('lively');
    renderEditor(<MotionStyleLibraryDialog open onOpenChange={vi.fn()} />, { store });
    await user.click(screen.getByRole('button', { name: 'Rõ' }));
    await user.click(screen.getByRole('button', { name: 'Xem thử tất cả' }));
    expect(store.getState().draft.composition.motion?.level).toBe('mid');
    expect(
      within(card('Không hiệu ứng')).getByRole('button', {
        name: 'Không chuyển động Không hiệu ứng',
      }),
    ).toBeDisabled();
  });
});
