import { endpoints, type PageSummary } from '@plp/contracts';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { EditorStoreProvider, type EditorStore } from '../editor';
import { asset, makeStore, PAGE_ID, pageDetail, SITE_ID } from '../editor/test-fixtures';
import { renderWithProviders } from '../shell/test-utils';
import { type SeoFocus, SeoForm } from './SeoForm';

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

const livePage: Partial<PageSummary> = {
  status: { kind: 'live', changeCount: 0, changes: [] },
  liveRelease: {
    id: '64b0000000000000000000e1',
    version: 12,
    slug: 'uu-dai-thang-11',
    publishedAt: '2026-10-24T06:02:00.000Z',
  },
  latestVersion: 12,
  liveUrl: 'https://smilecare.payload.site/uu-dai-thang-11',
};

function renderForm(page: Partial<PageSummary> = {}, initialFocus: SeoFocus | null = null) {
  const store: EditorStore = makeStore({ detail: pageDetail(undefined, page) });
  const onRetrySave = vi.fn();
  renderWithProviders(
    <EditorStoreProvider store={store}>
      <SeoForm
        host="smilecare.payload.site"
        initialFocus={initialFocus}
        onRetrySave={onRetrySave}
      />
    </EditorStoreProvider>,
  );
  return store;
}

function slugInput(): HTMLElement {
  return screen.getByRole('textbox', { name: 'Đường dẫn trang' });
}

const REDIRECT_TEXT = /Trang này đang live\. Khi xuất bản, link cũ/;
const SLUG_HINT = 'Chỉ dùng chữ thường không dấu, số và dấu gạch ngang.';

beforeEach(() => {
  apiMock.mockReset();
});

describe('SeoForm slug', () => {
  it('warns about the redirect only when the page is live and the slug changed', async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue({ slug: 'uu-dai-tet', available: true, reason: null, message: null });
    renderForm(livePage);

    expect(slugInput()).toHaveValue('uu-dai-thang-11');
    expect(screen.getByText(SLUG_HINT)).toBeInTheDocument();
    expect(screen.queryByText(REDIRECT_TEXT)).not.toBeInTheDocument();

    await user.clear(slugInput());
    await user.type(slugInput(), 'uu-dai-tet');

    const notice = screen.getByText(REDIRECT_TEXT);
    expect(notice).toHaveTextContent('/uu-dai-thang-11');
    expect(slugInput()).toHaveAccessibleDescription(
      expect.stringContaining('link cũ /uu-dai-thang-11'),
    );
    expect(screen.queryByText(SLUG_HINT)).not.toBeInTheDocument();
  });

  it('does not warn for a page that is not live', async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue({ slug: 'uu-dai-tet', available: true, reason: null, message: null });
    renderForm();

    await user.clear(slugInput());
    await user.type(slugInput(), 'uu-dai-tet');
    expect(screen.queryByText(REDIRECT_TEXT)).not.toBeInTheDocument();
  });

  it('normalizes typing and saves the slug once the server says it is free', async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue({ slug: 'uu-dai-tet', available: true, reason: null, message: null });
    const store = renderForm();

    await user.clear(slugInput());
    await user.type(slugInput(), 'Ưu đãi Tết');
    expect(slugInput()).toHaveValue('uu-dai-tet');

    await waitFor(() => {
      expect(store.getState().draft.slug).toBe('uu-dai-tet');
    });
    expect(apiMock).toHaveBeenLastCalledWith(endpoints.slugAvailability, [SITE_ID], {
      query: { slug: 'uu-dai-tet', pageId: PAGE_ID },
      signal: expect.any(AbortSignal) as unknown,
    });
    const available = await screen.findByText('Đường dẫn này dùng được.');
    expect(available).toBeVisible();
    // The result also reaches screen readers while they keep typing (WCAG 4.1.3).
    expect(available.closest('[aria-live="polite"]')).not.toBeNull();
  });

  it('keeps a taken slug out of the draft and explains why', async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue({
      slug: 'bang-gia',
      available: false,
      reason: 'taken',
      message: 'Đường dẫn này đang được trang “Bảng giá” dùng',
    });
    const store = renderForm();

    await user.clear(slugInput());
    await user.type(slugInput(), 'bang-gia');

    const taken = await screen.findByText('Đường dẫn này đang được trang “Bảng giá” dùng');
    expect(taken).toBeVisible();
    expect(taken.closest('[aria-live="polite"]')).not.toBeNull();
    expect(slugInput()).toHaveAttribute('aria-invalid', 'true');
    expect(store.getState().draft.slug).toBe('uu-dai-thang-11');
  });

  it('rejects a reserved slug without asking the server', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.clear(slugInput());
    await user.type(slugInput(), 'api');

    expect(screen.getByText('Đường dẫn này được hệ thống giữ lại')).toBeVisible();
    expect(apiMock).not.toHaveBeenCalled();
  });
});

describe('SeoForm fields', () => {
  it('counts the title against 60 and explains its length', async () => {
    const user = userEvent.setup();
    const store = renderForm();
    const title = screen.getByRole('textbox', { name: 'Tiêu đề trên công cụ tìm kiếm' });

    expect(screen.getByText('Đang để trống: sẽ dùng tiêu đề Hero.')).toBeInTheDocument();
    expect(screen.getByText('0 / 60')).toBeInTheDocument();

    await user.type(title, 'Niềng răng trong suốt');
    expect(screen.getByText('Độ dài phù hợp.')).toBeInTheDocument();
    expect(store.getState().draft.seo.title).toBe('Niềng răng trong suốt');
    // Typing one field is one undo step.
    expect(store.getState().history.past).toHaveLength(1);

    await user.type(title, ' — tư vấn miễn phí cùng bác sĩ Smile Care quận 3');
    expect(
      screen.getByText('Hơi dài: phần cuối có thể bị cắt trên kết quả tìm kiếm.'),
    ).toBeInTheDocument();
  });

  it('turns indexing off and on through the switch', async () => {
    const user = userEvent.setup();
    const store = renderForm();
    const indexing = screen.getByRole('switch', {
      name: 'Cho phép hiện trên Google và công cụ tìm kiếm',
    });

    expect(indexing).toBeChecked();
    await user.click(indexing);
    expect(store.getState().draft.seo.noindex).toBe(true);
    expect(indexing).not.toBeChecked();
  });

  it('uses the site default share image until the page picks one', () => {
    renderForm();
    expect(screen.getByText('Site chưa có ảnh chia sẻ mặc định')).toBeInTheDocument();
    expect(screen.getByText('Khuyên dùng 1200 × 630 px')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chọn ảnh riêng cho trang' })).toBeInTheDocument();
  });

  it('keeps the focus through choosing a page image and going back to the default', async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue({ items: [asset], nextCursor: null });
    renderForm();
    await user.click(screen.getByRole('button', { name: 'Chọn ảnh riêng cho trang' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ảnh khi chia sẻ' });
    await user.click(
      await within(dialog).findByRole('button', { name: /Bác sĩ tư vấn cho khách hàng/ }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Chọn ảnh' }));
    // The button that opened the picker made way for "Thay ảnh", which takes the focus.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Thay ảnh' })).toHaveFocus();
    });

    await user.click(screen.getByRole('button', { name: 'Gỡ ảnh' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Chọn ảnh riêng cho trang' })).toHaveFocus();
    });
  });

  it('moves the focus to the save status when "Thử lại" is pressed, as the button goes away', async () => {
    const user = userEvent.setup();
    const store = renderForm();
    act(() => {
      store.getState().markSaveFailed({ kind: 'retryable', message: 'Mất kết nối' });
    });
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    const status = screen
      .getAllByRole('status')
      .find((element) => element.textContent.includes('Thử lại'));
    expect(status).toHaveFocus();
  });

  it('focuses the field a publish check points at', () => {
    renderForm({}, 'description');
    expect(screen.getByRole('textbox', { name: 'Mô tả ngắn' })).toHaveFocus();
  });
});
