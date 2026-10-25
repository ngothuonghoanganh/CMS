import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StructurePanel } from './StructurePanel';
import { emptyChecks, makeStore, sectionIds } from './test-fixtures';
import { renderEditor } from './test-render';

const HERO = 'hero00000001';
const BENEFITS = 'benefits0001';

function rows() {
  const nav = screen.getByRole('navigation', { name: 'CẤU TRÚC TRANG' });
  return within(within(nav).getByRole('list')).getAllByRole('listitem');
}

describe('StructurePanel', () => {
  it('lists every section with its kind and summary, without drag handles on fixed ones', () => {
    renderEditor(<StructurePanel onOpenTheme={vi.fn()} />, { store: makeStore() });
    expect(screen.getByRole('heading', { name: 'CẤU TRÚC TRANG' })).toBeInTheDocument();
    expect(screen.getByText('5 section')).toBeInTheDocument();
    expect(rows()).toHaveLength(5);
    expect(within(rows()[1] ?? document.body).getByText('Hero')).toBeInTheDocument();
    expect(
      screen.getByText('“Tiêu đề nói rõ lợi ích lớn nhất cho khách hàng”'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kéo để sắp xếp Thanh điều hướng' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Kéo để sắp xếp Chân trang' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Kéo để sắp xếp Hero' })).toBeInTheDocument();
  });

  it('moves the selected section with the buttons and announces the new position', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    renderEditor(<StructurePanel onOpenTheme={vi.fn()} />, { store });
    await user.click(screen.getByRole('button', { name: /^Hero/ }));
    expect(store.getState().selection.sectionId).toBe(HERO);

    expect(screen.getByRole('button', { name: 'Chuyển Hero lên trên' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Chuyển Hero xuống dưới' }));
    expect(sectionIds(store).indexOf(HERO)).toBe(2);
    expect(screen.getByText('Đã chuyển Hero tới vị trí 3 / 5.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Chuyển Hero lên trên' }));
    expect(sectionIds(store).indexOf(HERO)).toBe(1);
    expect(screen.getByText('Đã chuyển Hero tới vị trí 2 / 5.')).toBeInTheDocument();
    expect(store.getState().history.past).toHaveLength(2);
  });

  it('keeps the footer in place: the last movable section cannot go down', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    renderEditor(<StructurePanel onOpenTheme={vi.fn()} />, { store });
    await user.click(screen.getByRole('button', { name: /^Câu hỏi thường gặp/ }));
    expect(
      screen.getByRole('button', { name: 'Chuyển Câu hỏi thường gặp xuống dưới' }),
    ).toBeDisabled();
  });

  it('hides and shows a section for the device group being previewed', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store.getState().setDevice('mobile');
    renderEditor(<StructurePanel onOpenTheme={vi.fn()} />, { store });
    await user.click(screen.getByRole('button', { name: 'Ẩn hoặc hiện Lợi ích' }));
    expect(store.getState().draft.composition.sections[2]?.visibility).toEqual({
      desktop: true,
      mobile: false,
    });
    expect(screen.getByText('Ẩn trên điện thoại')).toBeInTheDocument();
    expect(screen.getByText('Đã ẩn Lợi ích trên điện thoại.')).toBeInTheDocument();

    store.getState().setDevice('tablet');
    await user.click(screen.getByRole('button', { name: 'Ẩn hoặc hiện Lợi ích' }));
    expect(store.getState().draft.composition.sections[2]?.visibility.desktop).toBe(false);
    expect(screen.getByText('Ẩn trên máy tính')).toBeInTheDocument();
  });

  it('marks sections that have a blocking check', () => {
    const store = makeStore();
    store.getState().setServerState({
      checks: {
        ...emptyChecks,
        blocking: [
          {
            code: 'required_field_empty',
            severity: 'blocking',
            fingerprint: 'x',
            title: 'Lợi ích chưa có tiêu đề',
            description: '',
            target: { kind: 'section', sectionId: BENEFITS, fieldPath: 'heading' },
          },
        ],
      },
    });
    renderEditor(<StructurePanel onOpenTheme={vi.fn()} />, { store });
    const benefits = rows()[2] ?? document.body;
    expect(within(benefits).getByRole('img', { name: 'Có lỗi' })).toBeInTheDocument();
    // The reason is on the row itself, as on board 03.
    expect(within(benefits).getByText('Lợi ích chưa có tiêu đề')).toBeVisible();
    expect(within(rows()[1] ?? document.body).queryByRole('img', { name: 'Có lỗi' })).toBeNull();
  });

  it('adds after the selected section, or at the end before the footer', async () => {
    const user = userEvent.setup();
    const openAddSection = vi.fn();
    const store = makeStore();
    renderEditor(<StructurePanel onOpenTheme={vi.fn()} />, {
      store,
      services: { openAddSection },
    });
    await user.click(screen.getByRole('button', { name: 'Thêm section' }));
    expect(openAddSection).toHaveBeenLastCalledWith(5);
    await user.click(screen.getByRole('button', { name: /^Hero/ }));
    await user.click(screen.getByRole('button', { name: 'Thêm section' }));
    expect(openAddSection).toHaveBeenLastCalledWith(2);
  });

  it('opens the site theme picker', async () => {
    const user = userEvent.setup();
    const onOpenTheme = vi.fn();
    renderEditor(<StructurePanel onOpenTheme={onOpenTheme} />, { store: makeStore() });
    await user.click(screen.getByRole('button', { name: 'Giao diện site · màu & chữ' }));
    expect(onOpenTheme).toHaveBeenCalledTimes(1);
  });
});
