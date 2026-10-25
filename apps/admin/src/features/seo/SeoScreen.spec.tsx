import { type Composition, endpoints, type PageDetailResponse } from '@plp/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { api } from '../../lib/api';
import { pageDetail, PAGE_ID, site, SITE_ID } from '../editor/test-fixtures';
import { renderWithProviders } from '../shell/test-utils';
import { SeoScreen } from './SeoScreen';

const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api) as unknown as Mock<(endpoint: unknown) => Promise<unknown>>;

/**
 * On mount the screen re-reads the page (a Back/Forward payload can be outdated); here it is
 * unchanged. Other requests get `other`.
 */
function answerApi(
  other: (endpoint: unknown) => Promise<unknown> = () => Promise.resolve(),
  detail: PageDetailResponse = pageDetail(),
) {
  apiMock.mockImplementation((endpoint) =>
    endpoint === endpoints.getPage ? Promise.resolve(detail) : other(endpoint),
  );
}

function renderScreen(composition?: Composition) {
  const detail = pageDetail(composition);
  answerApi(undefined, detail);
  renderWithProviders(
    <SeoScreen
      initial={{ detail, site, assets: [], role: 'editor' }}
      loadedAt={Date.now()}
      focus={null}
    />,
  );
  return detail;
}

beforeEach(() => {
  apiMock.mockReset();
  router.push.mockReset();
});

describe('SeoScreen', () => {
  it('shows the page header with the SEO tab and the draft notice', () => {
    renderScreen();
    expect(screen.getByRole('link', { name: 'SEO & chia sẻ' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      screen.getByText(
        'Thiết lập SEO thuộc bản nháp: chỉ có hiệu lực trên trang live sau khi bạn xuất bản.',
      ),
    ).toBeInTheDocument();
    // A draft page has nothing to unpublish.
    expect(screen.queryByRole('button', { name: 'Tùy chọn khác' })).not.toBeInTheDocument();
  });

  it('previews the search result from the draft as it is typed', async () => {
    const user = userEvent.setup();
    renderScreen();
    const preview = screen.getByRole('region', { name: 'Kết quả tìm kiếm' });
    expect(within(preview).getByText('Smile Care')).toBeInTheDocument();
    expect(
      within(preview).getByText('smilecare.payload.site › uu-dai-thang-11'),
    ).toBeInTheDocument();

    await user.type(
      screen.getByRole('textbox', { name: 'Tiêu đề trên công cụ tìm kiếm' }),
      'Niềng răng trong suốt',
    );
    expect(within(preview).getByText('Niềng răng trong suốt')).toBeInTheDocument();

    await user.click(
      screen.getByRole('switch', { name: 'Cho phép hiện trên Google và công cụ tìm kiếm' }),
    );
    expect(
      within(preview).getByText('Trang sẽ không hiện trên công cụ tìm kiếm sau khi xuất bản.'),
    ).toBeInTheDocument();
  });

  it('previews the title the live page really gets: the site name when no Hero has one', () => {
    renderScreen({ version: 1, sections: [] });
    const preview = screen.getByRole('region', { name: 'Kết quả tìm kiếm' });
    expect(within(preview).getAllByText('Smile Care')).toHaveLength(2);
    expect(within(preview).queryByText('Ưu đãi niềng răng tháng 11')).toBeNull();
    expect(screen.getByText('Đang để trống: sẽ dùng tên site “Smile Care”.')).toBeInTheDocument();
  });

  it('shows a share card without an image when neither the page nor the site has one', () => {
    renderScreen();
    const share = screen.getByRole('region', { name: 'Khi chia sẻ qua Facebook, Zalo' });
    expect(
      within(share).getByText(
        'Chưa có ảnh chia sẻ, nên link sẽ không có ảnh lớn. Chọn ảnh ở mục “Ảnh khi chia sẻ”.',
      ),
    ).toBeInTheDocument();
    // No branded tile with the site name pretends to be the shared image.
    expect(within(share).queryByText('Smile Care')).toBeNull();
    expect(screen.getByText('Site chưa có ảnh chia sẻ mặc định')).toBeInTheDocument();
  });

  it('saves pending changes before leaving through the header', async () => {
    const user = userEvent.setup();
    const detail = renderScreen();
    answerApi(() =>
      Promise.resolve({
        revision: 4,
        updatedAt: '2026-10-24T08:05:00.000Z',
        page: detail.page,
        checks: detail.checks,
      }),
    );

    await user.type(screen.getByRole('textbox', { name: 'Mô tả ngắn' }), 'Tư vấn miễn phí');
    await user.click(screen.getByRole('link', { name: 'Mở editor' }));

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith(`/sites/${SITE_ID}/pages/${PAGE_ID}/edit`);
    });
    expect(apiMock).toHaveBeenCalledWith(endpoints.saveDraft, [PAGE_ID], {
      body: expect.objectContaining({
        baseRevision: 3,
        seo: expect.objectContaining({ description: 'Tư vấn miễn phí' }) as unknown,
      }) as unknown,
    });
  });

  it('leaves at once when everything is saved', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole('link', { name: 'Lịch sử phiên bản' }));
    expect(router.push).toHaveBeenCalledWith(`/sites/${SITE_ID}/pages/${PAGE_ID}/history`);
    // Nothing is saved: the only request is the check for a newer draft.
    expect(apiMock.mock.calls.map(([endpoint]) => endpoint)).toEqual([endpoints.getPage]);
  });
});
