import {
  type Composition,
  endpoints,
  type PageDetailResponse,
  type PageSummary,
} from '@plp/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { api } from '../../lib/api';
import { pageDetail, PAGE_ID, site, SITE_ID } from '../editor/test-fixtures';
import { installHistoryGuard } from '../shell/history-guard';
import { apiError, renderWithProviders } from '../shell/test-utils';
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

// As the root providers do while loading: ahead of any router listener.
installHistoryGuard();

// jsdom has no pointer capture; Radix menus call it while handling pointer events.
beforeAll(() => {
  for (const method of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture']) {
    if (!Reflect.has(Element.prototype, method)) {
      Object.defineProperty(Element.prototype, method, {
        configurable: true,
        value: method === 'hasPointerCapture' ? () => false : () => undefined,
      });
    }
  }
});

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

  describe('with a change still to save', () => {
    /** A link of the page outside this screen, like the sidebar's "Trang". */
    function outsideLink(): HTMLAnchorElement {
      const link = document.createElement('a');
      link.href = `/sites/${SITE_ID}`;
      link.textContent = 'Trang';
      document.body.append(link);
      return link;
    }

    it('saves before following any link of the page, then follows it', async () => {
      const user = userEvent.setup();
      const detail = renderScreen();
      let answerSave: () => void = () => undefined;
      answerApi(
        () =>
          new Promise((resolve) => {
            answerSave = () => {
              resolve({
                revision: 4,
                updatedAt: '2026-10-24T08:05:00.000Z',
                page: detail.page,
                checks: detail.checks,
              });
            };
          }),
      );
      const link = outsideLink();
      await user.type(screen.getByRole('textbox', { name: 'Mô tả ngắn' }), 'Tư vấn miễn phí');
      await user.click(link);

      await waitFor(() => {
        expect(apiMock).toHaveBeenCalledWith(endpoints.saveDraft, [PAGE_ID], expect.anything());
      });
      expect(router.push).not.toHaveBeenCalled();
      answerSave();
      await waitFor(() => {
        expect(router.push).toHaveBeenCalledWith(`/sites/${SITE_ID}`);
      });
      link.remove();
    });

    it('stays, keeping the change, when that save fails', async () => {
      const user = userEvent.setup();
      renderScreen();
      answerApi(() => Promise.reject(apiError(503, 'internal', 'Máy chủ đang bận')));
      const link = outsideLink();
      await user.type(screen.getByRole('textbox', { name: 'Mô tả ngắn' }), 'Tư vấn miễn phí');
      await user.click(link);

      expect(await screen.findByText('Chưa lưu được thiết lập SEO')).toBeInTheDocument();
      expect(router.push).not.toHaveBeenCalled();
      expect(screen.getByRole('textbox', { name: 'Mô tả ngắn' })).toHaveValue('Tư vấn miễn phí');
      link.remove();
    });

    it('saves before the browser goes Back, then goes back', async () => {
      const user = userEvent.setup();
      const detail = renderScreen();
      let answerSave: () => void = () => undefined;
      answerApi(
        () =>
          new Promise((resolve) => {
            answerSave = () => {
              resolve({
                revision: 4,
                updatedAt: '2026-10-24T08:05:00.000Z',
                page: detail.page,
                checks: detail.checks,
              });
            };
          }),
      );
      const pushState = vi.spyOn(window.history, 'pushState');
      const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
      const routerListener = vi.fn();
      window.addEventListener('popstate', routerListener);
      try {
        await user.type(screen.getByRole('textbox', { name: 'Mô tả ngắn' }), 'Tư vấn miễn phí');
        window.dispatchEvent(new PopStateEvent('popstate', { state: { previous: true } }));

        // The router never saw this Back; the screen's entry is back in place while it saves.
        expect(routerListener).not.toHaveBeenCalled();
        expect(pushState).toHaveBeenCalledTimes(1);
        await waitFor(() => {
          expect(apiMock).toHaveBeenCalledWith(endpoints.saveDraft, [PAGE_ID], expect.anything());
        });
        expect(back).not.toHaveBeenCalled();
        answerSave();
        await waitFor(() => {
          expect(back).toHaveBeenCalledTimes(1);
        });
      } finally {
        window.removeEventListener('popstate', routerListener);
        pushState.mockRestore();
        back.mockRestore();
      }
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

  describe('unpublishing from the header', () => {
    function liveDetail() {
      const detail = pageDetail(undefined, {
        status: { kind: 'live', changeCount: 0, changes: [] },
        liveRelease: {
          id: '64b000000000000000000201',
          version: 12,
          slug: 'uu-dai-thang-11',
          publishedAt: '2026-10-24T06:02:00.000Z',
        },
        latestVersion: 12,
        liveUrl: 'https://smilecare.payload.site/uu-dai-thang-11',
      });
      const unpublished: PageSummary = {
        ...detail.page,
        status: { kind: 'unpublished', changeCount: 0, changes: [] },
        liveRelease: null,
        liveUrl: null,
      };
      return { detail, unpublished };
    }

    async function unpublish(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole('button', { name: 'Tùy chọn khác' }));
      await user.click(screen.getByRole('menuitem', { name: 'Gỡ xuất bản' }));
      const dialog = screen.getByRole('alertdialog');
      await user.type(within(dialog).getByRole('textbox', { name: /Lý do/ }), 'Hết chương trình');
      const confirm = within(dialog).getAllByRole('button', { name: 'Gỡ xuất bản' }).at(-1);
      if (confirm === undefined) {
        throw new Error('confirm button missing');
      }
      await user.click(confirm);
      await waitFor(() => {
        expect(screen.queryByRole('alertdialog')).toBeNull();
      });
    }

    it('keeps the focus in the header when the page is unpublished from it', async () => {
      const user = userEvent.setup();
      const { detail, unpublished } = liveDetail();
      answerApi(
        (endpoint) =>
          endpoint === endpoints.movePointer
            ? Promise.resolve({
                activityId: '64b000000000000000000401',
                page: unpublished,
                revalidation: 'ok',
              })
            : Promise.reject(new Error('unexpected call')),
        detail,
      );
      renderWithProviders(
        <SeoScreen
          initial={{ detail, site, assets: [], role: 'owner' }}
          loadedAt={Date.now()}
          focus={null}
        />,
      );

      await unpublish(user);
      // The header's links ask before leaving here: "Mở editor" must still take the focus.
      expect(screen.queryByRole('button', { name: 'Tùy chọn khác' })).toBeNull();
      await waitFor(() => {
        expect(screen.getByRole('link', { name: 'Mở editor' })).toHaveFocus();
      });
    });

    it('reads the page again when a teammate unpublished it first', async () => {
      const user = userEvent.setup();
      const { detail, unpublished } = liveDetail();
      let reads = 0;
      apiMock.mockImplementation((endpoint) => {
        if (endpoint === endpoints.getPage) {
          reads += 1;
          // The mount read sees the live page; the read after the conflict, the teammate's change.
          return Promise.resolve(reads === 1 ? detail : { ...detail, page: unpublished });
        }
        if (endpoint === endpoints.movePointer) {
          return Promise.reject(apiError(409, 'pointer_conflict', 'Trang live vừa được thay đổi'));
        }
        return Promise.reject(new Error('unexpected call'));
      });
      renderWithProviders(
        <SeoScreen
          initial={{ detail, site, assets: [], role: 'owner' }}
          loadedAt={Date.now()}
          focus={null}
        />,
      );
      await waitFor(() => {
        expect(reads).toBe(1);
      });

      await unpublish(user);
      // The header no longer offers to unpublish a page that is not live, and keeps the focus.
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Tùy chọn khác' })).toBeNull();
      });
      expect(reads).toBe(2);
      expect(screen.getByRole('link', { name: 'Mở editor' })).toHaveFocus();
    });
  });
});
