import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AddSectionDialog } from './AddSectionDialog';
import { makeStore, sectionIds } from './test-fixtures';
import { renderEditor } from './test-render';

function categoryNav() {
  return within(screen.getByRole('navigation', { name: 'Nhóm section' }));
}

describe('AddSectionDialog', () => {
  it('says where the section goes and lists categories with counts', () => {
    renderEditor(<AddSectionDialog open onOpenChange={vi.fn()} requestedIndex={2} />, {
      store: makeStore(),
    });
    const dialog = screen.getByRole('dialog', { name: 'Thêm section' });
    expect(dialog).toHaveAccessibleDescription('Chèn sau Hero · vị trí 3 / 6');
    const hero = categoryNav().getByRole('button', { name: /^Thanh điều hướng/ });
    expect(hero).toHaveTextContent('1');
    expect(categoryNav().getByRole('button', { name: /^Hero/ })).toHaveTextContent('3');
    expect(
      screen.getByText(
        'Section mới có nội dung mẫu được đánh dấu. Trang sẽ nhắc nếu còn nội dung mẫu khi xuất bản.',
      ),
    ).toBeInTheDocument();
  });

  it('filters by name and description, ignoring Vietnamese accents', async () => {
    const user = userEvent.setup();
    renderEditor(<AddSectionDialog open onOpenChange={vi.fn()} requestedIndex={2} />, {
      store: makeStore(),
    });
    await user.type(screen.getByRole('searchbox', { name: 'Tìm section' }), 'nhan xet');
    const categories = categoryNav().getAllByRole('button');
    expect(categories).toHaveLength(1);
    expect(categories[0]).toHaveTextContent('Bằng chứng xã hội');
    expect(screen.getByRole('button', { name: /^Nhận xét dạng thẻ/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Trích dẫn nổi bật/ })).toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox', { name: 'Tìm section' }));
    await user.type(screen.getByRole('searchbox', { name: 'Tìm section' }), 'bảng giá');
    expect(screen.getByText('Không tìm thấy section phù hợp với “bảng giá”.')).toBeInTheDocument();
  });

  it('disables singletons that are already on the page', async () => {
    const user = userEvent.setup();
    renderEditor(<AddSectionDialog open onOpenChange={vi.fn()} requestedIndex={2} />, {
      store: makeStore(),
    });
    await user.click(categoryNav().getByRole('button', { name: /^Chân trang/ }));
    const card = screen.getByRole('button', { name: /^Chân trang cơ bản/ });
    expect(card).toHaveAttribute('aria-disabled', 'true');
    expect(within(card).getByText('Đã có trên trang')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thêm section' })).toBeDisabled();
  });

  it('marks variants recommended for the page goal', async () => {
    const user = userEvent.setup();
    renderEditor(<AddSectionDialog open onOpenChange={vi.fn()} requestedIndex={2} />, {
      store: makeStore(),
    });
    await user.click(categoryNav().getByRole('button', { name: /^Kêu gọi hành động/ }));
    expect(
      within(screen.getByRole('button', { name: /^Dải kêu gọi/ })).getByText('Hợp mục tiêu'),
    ).toBeInTheDocument();
  });

  it('inserts the chosen variant at the requested index and selects it', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const store = makeStore();
    renderEditor(<AddSectionDialog open onOpenChange={onOpenChange} requestedIndex={2} />, {
      store,
    });
    await user.click(categoryNav().getByRole('button', { name: /^Bằng chứng xã hội/ }));
    const quote = screen.getByRole('button', { name: /^Trích dẫn nổi bật/ });
    await user.click(quote);
    expect(quote).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Thêm “Trích dẫn nổi bật”' }));

    const added = store.getState().draft.composition.sections[2];
    expect(added).toMatchObject({ type: 'testimonials', variant: 'quote' });
    expect(store.getState().selection.sectionId).toBe(added?.id);
    expect(sectionIds(store)).toHaveLength(6);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByText('Đã thêm Cảm nhận khách hàng ở vị trí 3.')).toBeInTheDocument();
  });

  it('puts a navigation bar first even when asked for another index', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store.getState().removeSection('navbar000001');
    renderEditor(<AddSectionDialog open onOpenChange={vi.fn()} requestedIndex={3} />, {
      store,
    });
    await user.click(categoryNav().getByRole('button', { name: /^Thanh điều hướng/ }));
    expect(screen.getByRole('dialog', { name: 'Thêm section' })).toHaveAccessibleDescription(
      'Chèn vào đầu trang · vị trí 1 / 5',
    );
    await user.click(screen.getByRole('button', { name: 'Thêm “Logo · nút”' }));
    expect(store.getState().draft.composition.sections[0]?.type).toBe('navbar');
  });

  it('opens the first category with something to add', () => {
    renderEditor(<AddSectionDialog open onOpenChange={vi.fn()} requestedIndex={2} />, {
      store: makeStore(),
    });
    expect(screen.getByRole('heading', { level: 2, name: 'Hero' })).toBeInTheDocument();
    expect(categoryNav().getByRole('button', { name: /^Hero/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Thêm “Chữ · Ảnh”' })).toBeEnabled();
  });
});
