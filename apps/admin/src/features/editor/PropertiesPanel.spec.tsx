import { getAtPath } from '@plp/sections/schema';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PropertiesPanel } from './PropertiesPanel';
import { ASSET_ID, makeStore, OTHER_PAGE_ID, pageSummary, sectionById } from './test-fixtures';
import { renderEditor } from './test-render';

const HERO = 'hero00000001';
const BENEFITS = 'benefits0001';
const FAQ = 'faq000000001';

function fieldBox(path: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-field-path="${path}"]`);
  if (!element) {
    throw new Error(`No field ${path}`);
  }
  return element;
}

describe('PropertiesPanel', () => {
  it('shows a hint and the SEO shortcut while nothing is selected', () => {
    renderEditor(<PropertiesPanel />, { store: makeStore() });
    expect(screen.getByText(/Chọn một section trên trang/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cài đặt trang & SEO' })).toHaveAttribute(
      'href',
      '/sites/64b000000000000000000001/pages/64b000000000000000000002/seo',
    );
  });

  it('renders the hero fields with counters, and typing is one undo step', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store.getState().select(HERO);
    renderEditor(<PropertiesPanel />, { store });

    expect(screen.getByRole('heading', { name: 'Hero', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Section 2 / 5')).toBeInTheDocument();
    for (const label of ['NỘI DUNG', 'BỐ CỤC', 'HIỂN THỊ']) {
      expect(screen.getByRole('heading', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByLabelText('Dòng nhỏ phía trên · nội dung mẫu')).toBeInTheDocument();
    const heading = screen.getByLabelText(/^Tiêu đề/);
    expect(within(fieldBox('heading')).getByText('46 / 80')).toBeInTheDocument();

    await user.clear(heading);
    await user.type(heading, 'Niềng răng');
    await user.tab();
    expect(sectionById(store, HERO).content.heading).toBe('Niềng răng');
    expect(within(fieldBox('heading')).getByText('10 / 80')).toBeInTheDocument();
    expect(store.getState().history.past).toHaveLength(1);
    expect(sectionById(store, HERO).samplePaths).not.toContain('heading');
  });

  it('edits a button label and its link, refusing an invalid phone number', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store.getState().select(HERO);
    renderEditor(<PropertiesPanel />, {
      store,
      sitePages: [pageSummary({ id: OTHER_PAGE_ID, title: 'Bảng giá', liveRelease: null })],
    });
    const primary = within(fieldBox('primaryCta'));
    expect(primary.getByLabelText(/^Chữ trên nút/)).toHaveValue('Đăng ký tư vấn');
    const target = primary.getByLabelText(/^Khi bấm, đưa tới/);
    expect(within(target).getByRole('option', { name: 'Gọi điện thoại' })).toBeInTheDocument();

    await user.selectOptions(target, 'phone');
    const phone = primary.getByLabelText('Số điện thoại');
    await user.type(phone, '09ab');
    await user.tab();
    expect(primary.getByText('Số điện thoại chỉ gồm chữ số, dấu + và khoảng trắng')).toBeVisible();
    expect(getAtPath(sectionById(store, HERO).content, 'primaryCta.link')).toEqual({
      kind: 'phone',
      phone: '',
    });

    await user.clear(phone);
    await user.type(phone, '0901 234 567');
    await user.tab();
    expect(getAtPath(sectionById(store, HERO).content, 'primaryCta.link')).toEqual({
      kind: 'phone',
      phone: '0901 234 567',
    });

    await user.selectOptions(primary.getByLabelText(/^Khi bấm, đưa tới/), 'page');
    expect(primary.getByRole('option', { name: 'Bảng giá (chưa live)' })).toBeInTheDocument();
    expect(getAtPath(sectionById(store, HERO).content, 'primaryCta.link')).toEqual({
      kind: 'page',
      pageId: OTHER_PAGE_ID,
    });
  });

  it('describes a chosen image and warns while its description is missing', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store
      .getState()
      .updateContent(HERO, 'image', { assetId: ASSET_ID, alt: '', decorative: false });
    store.getState().select(HERO);
    renderEditor(<PropertiesPanel />, { store });
    const image = within(fieldBox('image'));
    expect(image.getByRole('button', { name: 'Thay ảnh' })).toBeInTheDocument();
    expect(image.getByText('Cảnh báo: chưa có mô tả ảnh')).toBeInTheDocument();
    await user.type(
      image.getByLabelText(/^Mô tả ảnh cho người dùng trình đọc màn hình/),
      'Bác sĩ tư vấn',
    );
    expect(image.queryByText('Cảnh báo: chưa có mô tả ảnh')).toBeNull();
    await user.click(image.getByLabelText('Ảnh chỉ để trang trí'));
    expect(getAtPath(sectionById(store, HERO).content, 'image.decorative')).toBe(true);
  });

  it('keeps the focus on the image button after "Gỡ ảnh" removes itself', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store
      .getState()
      .updateContent(HERO, 'image', { assetId: ASSET_ID, alt: 'Bác sĩ', decorative: false });
    store.getState().select(HERO);
    renderEditor(<PropertiesPanel />, { store });
    const image = within(fieldBox('image'));
    await user.click(image.getByRole('button', { name: 'Gỡ ảnh' }));
    expect(image.getByRole('button', { name: 'Chọn ảnh' })).toHaveFocus();
    expect(getAtPath(sectionById(store, HERO).content, 'image.assetId')).toBeNull();
  });

  it('switches variants, hiding fields the variant does not use', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store.getState().select(HERO);
    renderEditor(<PropertiesPanel />, { store });
    const variants = screen.getByRole('group', { name: 'Kiểu bố cục' });
    expect(within(variants).getByRole('button', { name: 'Chữ · Ảnh' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByLabelText('Thứ tự trên điện thoại')).toBeInTheDocument();
    await user.click(within(variants).getByRole('button', { name: 'Căn giữa' }));
    expect(sectionById(store, HERO).variant).toBe('centered');
    expect(document.querySelector('[data-field-path="image"]')).toBeNull();
    expect(document.querySelector('[data-field-path="secondaryCta"]')).toBeNull();
    expect(screen.queryByLabelText('Thứ tự trên điện thoại')).toBeNull();
  });

  it('sets color scheme, spacing and visibility through the commands', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store.getState().select(HERO);
    renderEditor(<PropertiesPanel />, { store });
    const schemes = screen.getByRole('group', { name: 'Bảng màu của section' });
    expect(within(schemes).getAllByRole('button')).toHaveLength(4);
    expect(screen.getByText('Đạt tương phản AA')).toBeInTheDocument();
    await user.click(within(schemes).getByRole('button', { name: 'Tối' }));
    await user.click(screen.getByRole('button', { name: 'Rộng' }));
    await user.click(screen.getByRole('switch', { name: 'Hiện trên điện thoại' }));
    expect(sectionById(store, HERO)).toMatchObject({
      colorScheme: 'dark',
      spacing: 'spacious',
      visibility: { desktop: true, mobile: false },
    });
    expect(
      screen.getByText(
        'Nội dung luôn giống nhau trên mọi thiết bị; chỉ thứ tự và ẩn/hiện được tùy chỉnh.',
      ),
    ).toBeInTheDocument();
  });

  it('renders list items and disables adding at the maximum', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store.getState().select(BENEFITS);
    renderEditor(<PropertiesPanel />, { store });
    const list = within(fieldBox('items'));
    expect(list.getByText('3 / 6')).toBeInTheDocument();
    expect(list.getByRole('button', { name: /Lợi ích thứ nhất/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await user.click(list.getByRole('button', { name: /Lợi ích thứ nhất/ }));
    expect(list.getByLabelText('Biểu tượng')).toBeInTheDocument();

    const add = list.getByRole('button', { name: 'Thêm lợi ích' });
    await user.click(add);
    await user.click(add);
    await user.click(add);
    expect(list.getByText('6 / 6')).toBeInTheDocument();
    expect(add).toBeDisabled();
    expect(add).toHaveAccessibleDescription('Tối đa 6 lợi ích');
    expect(store.getState().addListItem(BENEFITS, 'items')).toBe(false);
  });

  it('disables removing items at the minimum of the variant, with the reason', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store.getState().select(BENEFITS);
    renderEditor(<PropertiesPanel />, { store });
    // "Lưới 3–6 lợi ích" keeps at least 3.
    let list = within(fieldBox('items'));
    expect(list.getByText('3 / 6')).toBeInTheDocument();
    expect(list.getByRole('button', { name: 'Xóa lợi ích 3' })).toBeDisabled();
    expect(list.getByRole('button', { name: 'Xóa lợi ích 3' })).toHaveAccessibleDescription(
      'Cần ít nhất 3 lợi ích, nên chưa xóa được.',
    );

    // "Xen kẽ ảnh và chữ" works with 2.
    await user.click(screen.getByRole('button', { name: /Xen kẽ ảnh và chữ/ }));
    list = within(fieldBox('items'));
    await user.click(list.getByRole('button', { name: 'Xóa lợi ích 3' }));
    expect(list.getByText('2 / 6')).toBeInTheDocument();
    const remove = list.getByRole('button', { name: 'Xóa lợi ích 1' });
    expect(remove).toBeDisabled();
    expect(remove).toHaveAccessibleDescription('Cần ít nhất 2 lợi ích, nên chưa xóa được.');
  });

  it('keeps keyboard focus on the list after deleting the last item', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store.getState().select(BENEFITS);
    renderEditor(<PropertiesPanel />, { store });
    const list = within(fieldBox('items'));
    await user.click(list.getByRole('button', { name: 'Thêm lợi ích' }));
    list.getByRole('button', { name: 'Xóa lợi ích 4' }).focus();
    await user.keyboard('{Enter}');
    expect(getAtPath(sectionById(store, BENEFITS).content, 'items')).toHaveLength(3);
    expect(list.getByRole('button', { name: /^Lợi ích thứ ba/ })).toHaveFocus();
  });

  it('follows the moved item with focus, so pressing again moves it further', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store.getState().select(FAQ);
    renderEditor(<PropertiesPanel />, { store });
    const list = within(fieldBox('items'));
    const first = getAtPath(sectionById(store, FAQ).content, 'items.0.question');
    list.getByRole('button', { name: 'Chuyển câu hỏi 1 xuống' }).focus();
    await user.keyboard('{Enter}');
    expect(list.getByRole('button', { name: 'Chuyển câu hỏi 2 xuống' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(getAtPath(sectionById(store, FAQ).content, 'items.2.question')).toBe(first);
    // At the end of the list "xuống" is disabled: focus moves to "lên" of the same item.
    expect(list.getByRole('button', { name: 'Chuyển câu hỏi 3 lên' })).toHaveFocus();
  });

  it('reorders list items with the arrow buttons', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store.getState().select(FAQ);
    renderEditor(<PropertiesPanel />, { store });
    const list = within(fieldBox('items'));
    expect(list.getByRole('button', { name: 'Chuyển câu hỏi 1 lên' })).toBeDisabled();
    await user.click(list.getByRole('button', { name: 'Chuyển câu hỏi 1 xuống' }));
    expect(getAtPath(sectionById(store, FAQ).content, 'items.1.question')).toBe(
      'Câu hỏi khách hàng hay hỏi nhất?',
    );
    expect(screen.getByText('Đã chuyển câu hỏi tới vị trí 2 / 3.')).toBeInTheDocument();
  });

  it('expands the list item of a focused field path', () => {
    const store = makeStore();
    store.getState().select(FAQ, 'items.2.answer');
    renderEditor(<PropertiesPanel />, { store });
    const item = within(fieldBox('items.2'));
    expect(item.getByRole('button', { name: /Tôi cần chuẩn bị gì\?/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(item.getByLabelText(/^Trả lời/)).toBeInTheDocument();
  });

  it('asks the call and Zalo buttons for a number only, and for at least one of them', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store.getState().addSection('quick_contact', 'buttons', 2);
    const id = store.getState().draft.composition.sections[2]?.id ?? '';
    renderEditor(<PropertiesPanel />, { store });

    const call = within(fieldBox('call'));
    expect(screen.getByRole('group', { name: 'Nút gọi điện' })).toBe(fieldBox('call'));
    // A call button calls: nothing else to choose, the number is what it still needs.
    expect(call.queryByLabelText(/^Khi bấm, đưa tới/)).toBeNull();
    const phone = call.getByLabelText(/^Số điện thoại/);
    expect(call.getByText('Nhập số trước khi xuất bản.')).toBeInTheDocument();
    await user.type(phone, '0901 234 567');
    await user.tab();
    expect(getAtPath(sectionById(store, id).content, 'call.link')).toEqual({
      kind: 'phone',
      phone: '0901 234 567',
    });
    expect(call.queryByText('Nhập số trước khi xuất bản.')).toBeNull();
    const zalo = within(fieldBox('zalo'));
    expect(zalo.queryByLabelText(/^Khi bấm, đưa tới/)).toBeNull();
    expect(zalo.getByLabelText(/^Số Zalo/)).toHaveValue('');

    // Without any label, neither button shows: both ask for one.
    await user.clear(call.getByLabelText(/^Chữ trên nút/));
    await user.clear(zalo.getByLabelText(/^Chữ trên nút/));
    await user.tab();
    expect(call.getByText('Cần ít nhất một nút trước khi xuất bản.')).toBeInTheDocument();
    expect(zalo.getByText('Cần ít nhất một nút trước khi xuất bản.')).toBeInTheDocument();
    await user.type(zalo.getByLabelText(/^Chữ trên nút/), 'Nhắn Zalo');
    expect(call.queryByText('Cần ít nhất một nút trước khi xuất bản.')).toBeNull();
    // An unused button needs no number.
    expect(zalo.getByText('Nhập số trước khi xuất bản.')).toBeInTheDocument();
  });

  it('names a partner logo by its description, the partner name', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store.getState().addSection('logos', 'row', 2);
    const id = store.getState().draft.composition.sections[2]?.id ?? '';
    store
      .getState()
      .updateContent(id, 'items.0.image', { assetId: ASSET_ID, alt: '', decorative: false });
    renderEditor(<PropertiesPanel />, { store });
    const list = within(fieldBox('items'));
    expect(list.getByText('4 / 12')).toBeInTheDocument();
    await user.click(list.getByRole('button', { name: /^Đối tác 1/ }));
    const name = list.getByLabelText(/^Tên đối tác/);
    expect(name).toHaveAttribute('placeholder', 'Ví dụ: Bệnh viện Hòa Bình');
    await user.type(name, 'Bệnh viện Hòa Bình');
    expect(getAtPath(sectionById(store, id).content, 'items.0.image.alt')).toBe(
      'Bệnh viện Hòa Bình',
    );
    expect(list.getByRole('button', { name: /^Bệnh viện Hòa Bình/ })).toBeInTheDocument();
  });

  it('keeps a process to 5 steps, and says why it cannot be chosen with more', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store.getState().select(BENEFITS);
    renderEditor(<PropertiesPanel />, { store });
    const variants = screen.getByRole('group', { name: 'Kiểu bố cục' });
    await user.click(within(variants).getByRole('button', { name: /^Quy trình 3 bước/ }));
    expect(sectionById(store, BENEFITS).variant).toBe('steps');
    let list = within(fieldBox('items'));
    expect(list.getByText('3 / 5')).toBeInTheDocument();
    // The step number takes the place of the icon; there is no image either.
    await user.click(list.getByRole('button', { name: /Lợi ích thứ nhất/ }));
    expect(list.queryByLabelText('Biểu tượng')).toBeNull();
    expect(document.querySelector('[data-field-path="items.0.image"]')).toBeNull();
    const add = list.getByRole('button', { name: 'Thêm lợi ích' });
    await user.click(add);
    await user.click(add);
    expect(add).toBeDisabled();
    expect(add).toHaveAccessibleDescription('Tối đa 5 lợi ích');

    // Six benefits in the grid: the process cannot take them all, and nothing is dropped.
    await user.click(within(variants).getByRole('button', { name: /^Lưới 3–6 lợi ích/ }));
    list = within(fieldBox('items'));
    await user.click(list.getByRole('button', { name: 'Thêm lợi ích' }));
    const steps = within(variants).getByRole('button', { name: /^Quy trình 3 bước/ });
    expect(steps).toHaveAttribute('aria-disabled', 'true');
    expect(steps).toHaveAccessibleDescription(
      '“Quy trình 3 bước” có tối đa 5 lợi ích. Xóa bớt lợi ích để chọn bố cục này.',
    );
    await user.click(steps);
    expect(sectionById(store, BENEFITS).variant).toBe('grid');
    expect(getAtPath(sectionById(store, BENEFITS).content, 'items')).toHaveLength(6);
  });

  it('closes with the close button', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store.getState().select(HERO);
    renderEditor(<PropertiesPanel />, { store });
    await user.click(screen.getByRole('button', { name: 'Đóng bảng thuộc tính' }));
    expect(store.getState().selection.sectionId).toBeNull();
  });
});
