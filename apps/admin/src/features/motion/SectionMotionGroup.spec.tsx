import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeStore, sectionById } from '../editor/test-fixtures';
import { renderEditor } from '../editor/test-render';
import { SectionMotionGroup } from './SectionMotionGroup';

const HERO = 'hero00000001';
const BENEFITS = 'benefits0001';
const FAQ = 'faq000000001';

function renderGroup(store: ReturnType<typeof makeStore>, sectionId: string, services = {}) {
  const sections = store.getState().draft.composition.sections;
  const index = sections.findIndex((section) => section.id === sectionId);
  const section = sections[index];
  if (!section) {
    throw new Error(`No section ${sectionId}`);
  }
  return renderEditor(<SectionMotionGroup section={section} index={index} />, { store, services });
}

describe('SectionMotionGroup (board 38, ADR-032)', () => {
  it('sends a page without motion to its settings', async () => {
    const user = userEvent.setup();
    const openPageMotion = vi.fn();
    renderGroup(makeStore(), FAQ, { openPageMotion });
    expect(screen.getByText(/Trang đang để Không hiệu ứng/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Mở Cài đặt trang' }));
    expect(openPageMotion).toHaveBeenCalledTimes(1);
  });

  it('keeps the first section of the page still, and says why', () => {
    const store = makeStore();
    store.getState().setMotionStyle('smooth');
    renderGroup(store, HERO);
    expect(screen.getByText('Luôn hiện ngay')).toBeVisible();
    expect(screen.getByText(/Section đầu trang không có hiệu ứng/)).toBeVisible();
    expect(screen.queryByRole('group', { name: 'Cách xuất hiện' })).toBeNull();
  });

  it('follows the page until the section changes how it enters, then goes back', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store.getState().setMotionStyle('smooth');
    const view = renderGroup(store, FAQ);
    const tiles = screen.getByRole('group', { name: 'Cách xuất hiện' });
    expect(within(tiles).getByRole('button', { name: /^Trượt lên/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(tiles).getByRole('button', { name: /^Trượt lên/ })).toHaveTextContent(
      'theo trang',
    );
    expect(screen.getAllByText('Theo cài đặt trang').length).toBeGreaterThan(0);

    await user.click(within(tiles).getByRole('button', { name: /^Bật lên/ }));
    expect(sectionById(store, FAQ).motion).toEqual({ enter: 'pop' });
    view.unmount();
    renderGroup(store, FAQ);
    expect(screen.getByText('Riêng cho section này')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Dùng lại cài đặt trang (Trượt lên)' }));
    expect(sectionById(store, FAQ).motion).toBeUndefined();
  });

  it('offers rows only to a section laid out in rows, and its own accents only', () => {
    const store = makeStore();
    store.getState().setMotionStyle('smooth');
    const faq = renderGroup(store, FAQ);
    const orders = () => screen.getByRole('group', { name: 'Thứ tự trong section' });
    expect(within(orders()).queryByRole('button', { name: /Theo hàng/ })).toBeNull();
    expect(screen.getByRole('switch', { name: 'Tiêu đề hiện từng dòng' })).toBeChecked();
    expect(screen.queryByRole('switch', { name: 'Ảnh hé lộ' })).toBeNull();
    faq.unmount();

    renderGroup(store, BENEFITS);
    expect(within(orders()).getByRole('button', { name: /Theo hàng/ })).toBeVisible();
  });

  it('leaves the order to connected steps, which enter one by one along their line', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store.getState().addSection('benefits', 'steps', 3);
    const steps = store.getState().selection.sectionId ?? '';
    store.getState().setMotionStyle('smooth');
    const view = renderGroup(store, steps);
    expect(screen.queryByRole('group', { name: 'Thứ tự trong section' })).toBeNull();
    expect(screen.getByText(/Các bước hiện lần lượt theo đường nối/)).toBeVisible();
    await user.click(screen.getByRole('switch', { name: 'Các bước nối nhau' }));
    view.unmount();
    renderGroup(store, steps);
    expect(screen.getByRole('group', { name: 'Thứ tự trong section' })).toBeVisible();
  });

  it('switches an accent for this section, and back to the page by switching it again', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store.getState().setMotionStyle('smooth');
    const first = renderGroup(store, FAQ);
    await user.click(screen.getByRole('switch', { name: 'Tiêu đề hiện từng dòng' }));
    expect(sectionById(store, FAQ).motion).toEqual({ accents: { lines: false } });
    first.unmount();
    renderGroup(store, FAQ);
    await user.click(screen.getByRole('switch', { name: 'Tiêu đề hiện từng dòng' }));
    expect(sectionById(store, FAQ).motion).toBeUndefined();
  });

  it('plays this section or the whole page', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store.getState().setMotionStyle('lively');
    renderGroup(store, FAQ);
    await user.click(screen.getByRole('button', { name: 'Chạy thử section này' }));
    expect(store.getState().motionPlay.scope).toEqual({ kind: 'section', sectionId: FAQ });
    await user.click(screen.getByRole('button', { name: 'Chạy thử cả trang' }));
    expect(store.getState().motionPlay.scope).toEqual({ kind: 'page' });
  });
});
