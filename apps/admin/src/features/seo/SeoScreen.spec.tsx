import {
  type Composition,
  endpoints,
  type Membership,
  type PageDetailResponse,
  type PageSummary,
} from '@plp/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, type Mock, onTestFinished, vi } from 'vitest';
import { api } from '../../lib/api';
import { loadPage } from '../../lib/page-load';
import { NO_LEADS, WORKSPACE_ID } from '../dashboard/test-fixtures';
import { pageDetail, PAGE_ID, site, SITE_ID } from '../editor/test-fixtures';
import { installHistoryGuard } from '../shell/history-guard';
import { type LeaveOutcome, leaveScreen } from '../shell/screen-leave';
import { Sidebar } from '../shell/Sidebar';
import { apiError, renderWithProviders } from '../shell/test-utils';
import { WORKSPACE_PREFERENCE_COOKIE } from '../shell/workspace-preference';
import { SeoScreen } from './SeoScreen';

const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => `/sites/${SITE_ID}/pages/${PAGE_ID}/seo`,
}));

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

vi.mock(import('../../lib/page-load'), () => ({ loadPage: vi.fn() }));

const loadPageMock = vi.mocked(loadPage);

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

/** How many saves of the draft were sent. */
function savesSent(): number {
  return apiMock.mock.calls.filter(([endpoint]) => endpoint === endpoints.saveDraft).length;
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

/** Where the tests start, and where each one comes back to. */
const START_URL = window.location.href;

/** What the browser does on Back: move to the previous entry (the site), then fire popstate. */
function pressBack(state?: unknown) {
  window.history.replaceState(state ?? null, '', `/sites/${SITE_ID}`);
  window.dispatchEvent(new PopStateEvent('popstate', { state }));
}

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
  router.replace.mockReset();
  window.history.replaceState(null, '', START_URL);
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

    /** A save that waits until the test answers it. */
    function heldSave(detail: PageDetailResponse) {
      let answer: () => void = () => undefined;
      answerApi(
        () =>
          new Promise((resolve) => {
            answer = () => {
              resolve({
                revision: 4,
                updatedAt: '2026-10-24T08:05:00.000Z',
                page: detail.page,
                checks: detail.checks,
              });
            };
          }),
      );
      return () => {
        answer();
      };
    }

    /** Clicks the link as a user would, then keeps jsdom from following it. */
    function clickAndSee(link: HTMLAnchorElement, init: MouseEventInit = {}): boolean {
      let prevented = false;
      const record = (event: Event) => {
        prevented = event.defaultPrevented;
        event.preventDefault();
      };
      window.addEventListener('click', record);
      link.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }),
      );
      window.removeEventListener('click', record);
      return prevented;
    }

    it.each<{ name: string; init?: MouseEventInit; prepare: (link: HTMLAnchorElement) => void }>([
      { name: 'a Ctrl click (new tab)', init: { ctrlKey: true }, prepare: () => undefined },
      { name: 'a Cmd click (new tab)', init: { metaKey: true }, prepare: () => undefined },
      { name: 'a Shift click (new window)', init: { shiftKey: true }, prepare: () => undefined },
      {
        name: 'a link opening a new tab',
        prepare: (link) => {
          link.target = '_blank';
        },
      },
      {
        name: 'a download link',
        prepare: (link) => {
          link.setAttribute('download', '');
        },
      },
      {
        name: 'a link to another site',
        prepare: (link) => {
          link.href = 'https://example.com/huong-dan';
        },
      },
      {
        name: 'a link within this page',
        prepare: (link) => {
          link.href = `${window.location.pathname}${window.location.search}#xem-truoc`;
        },
      },
    ])('lets $name do what it does, without saving first', async ({ init, prepare }) => {
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
      const link = outsideLink();
      prepare(link);
      await user.type(screen.getByRole('textbox', { name: 'Mô tả ngắn' }), 'Tư vấn');

      expect(clickAndSee(link, init)).toBe(false);
      expect(router.push).not.toHaveBeenCalled();
      link.remove();
    });

    it("still runs the link's own handler, so the phone menu closes", async () => {
      const user = userEvent.setup();
      const detail = renderScreen();
      const answerSave = heldSave(detail);
      const link = outsideLink();
      const closeDrawer = vi.fn();
      link.addEventListener('click', closeDrawer);
      await user.type(screen.getByRole('textbox', { name: 'Mô tả ngắn' }), 'Tư vấn miễn phí');

      expect(clickAndSee(link)).toBe(true);
      expect(closeDrawer).toHaveBeenCalledTimes(1);
      answerSave();
      await waitFor(() => {
        expect(router.push).toHaveBeenCalledWith(`/sites/${SITE_ID}`);
      });
      link.remove();
    });

    it('leaves once, to the last place asked for, when several are asked during the save', async () => {
      const user = userEvent.setup();
      const detail = renderScreen();
      const answerSave = heldSave(detail);
      const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
      const link = outsideLink();
      try {
        await user.type(screen.getByRole('textbox', { name: 'Mô tả ngắn' }), 'Tư vấn miễn phí');
        pressBack();
        pressBack();
        await user.click(link);
        await waitFor(() => {
          expect(apiMock).toHaveBeenCalledWith(endpoints.saveDraft, [PAGE_ID], expect.anything());
        });

        answerSave();
        await waitFor(() => {
          expect(router.push).toHaveBeenCalledTimes(1);
        });
        expect(router.push).toHaveBeenCalledWith(`/sites/${SITE_ID}`);
        expect(back).not.toHaveBeenCalled();
        const saves = apiMock.mock.calls.filter(([endpoint]) => endpoint === endpoints.saveDraft);
        expect(saves).toHaveLength(1);
      } finally {
        back.mockRestore();
        link.remove();
      }
    });

    it('does not follow a leave asked for before the screen went away', async () => {
      const user = userEvent.setup();
      const detail = pageDetail();
      answerApi(undefined, detail);
      const { unmount } = renderWithProviders(
        <SeoScreen
          initial={{ detail, site, assets: [], role: 'editor' }}
          loadedAt={Date.now()}
          focus={null}
        />,
      );
      const answerSave = heldSave(detail);
      const link = outsideLink();
      await user.type(screen.getByRole('textbox', { name: 'Mô tả ngắn' }), 'Tư vấn miễn phí');
      await user.click(link);
      await waitFor(() => {
        expect(apiMock).toHaveBeenCalledWith(endpoints.saveDraft, [PAGE_ID], expect.anything());
      });

      // A menu navigating in code took the user elsewhere meanwhile.
      unmount();
      answerSave();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(router.push).not.toHaveBeenCalled();
      link.remove();
    });

    it('offers to leave without the change when the save keeps failing', async () => {
      const user = userEvent.setup();
      renderScreen();
      answerApi(() => Promise.reject(apiError(403, 'forbidden', 'Bạn không còn quyền sửa trang')));
      const link = outsideLink();
      await user.type(screen.getByRole('textbox', { name: 'Mô tả ngắn' }), 'Tư vấn miễn phí');
      await user.click(link);

      await user.click(await screen.findByRole('button', { name: 'Rời trang, bỏ thay đổi' }));
      expect(router.push).toHaveBeenCalledWith(`/sites/${SITE_ID}`);
      link.remove();
    });

    it('leaves once, where the toast action goes, while another link waits for its save', async () => {
      const user = userEvent.setup();
      const detail = renderScreen();
      answerApi(() => Promise.reject(apiError(503, 'internal', 'Máy chủ đang bận')));
      const link = outsideLink();
      await user.type(screen.getByRole('textbox', { name: 'Mô tả ngắn' }), 'Tư vấn miễn phí');
      await user.click(link);
      expect(await screen.findByText('Chưa lưu được thiết lập SEO')).toBeInTheDocument();

      // Another link waits for a save that takes a while; meanwhile the user takes the way out
      // the first failure offers.
      const answerSave = heldSave(detail);
      await user.click(screen.getByRole('link', { name: 'Lịch sử phiên bản' }));
      await user.click(screen.getByRole('button', { name: 'Rời trang, bỏ thay đổi' }));
      expect(router.push).toHaveBeenCalledWith(`/sites/${SITE_ID}`);

      // The save ends, and keeps the change in the draft; the link that waited for it goes nowhere.
      answerSave();
      expect(await screen.findByText('Đã lưu bản nháp')).toBeInTheDocument();
      expect(savesSent()).toBe(2);
      expect(router.push).toHaveBeenCalledTimes(1);
      link.remove();
    });

    it('does nothing for the tab of this very page: no save first, no way out offered', async () => {
      const user = userEvent.setup();
      renderScreen();
      answerApi(() => Promise.reject(apiError(503, 'internal', 'Máy chủ đang bận')));
      // Opened from a publish check: the tab has no query, the screen is the same.
      window.history.replaceState(
        window.history.state,
        '',
        `/sites/${SITE_ID}/pages/${PAGE_ID}/seo?focus=description`,
      );
      await user.type(screen.getByRole('textbox', { name: 'Mô tả ngắn' }), 'Tư vấn miễn phí');
      const saves = savesSent();

      await user.click(screen.getByRole('link', { name: 'SEO & chia sẻ' }));
      expect(router.push).not.toHaveBeenCalled();
      expect(savesSent()).toBe(saves);
      expect(screen.queryByText('Chưa lưu được thiết lập SEO')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Rời trang, bỏ thay đổi' })).toBeNull();
    });

    it('follows a link to this screen with another query, after saving', async () => {
      const user = userEvent.setup();
      const detail = renderScreen();
      window.history.replaceState(
        window.history.state,
        '',
        `/sites/${SITE_ID}/pages/${PAGE_ID}/seo`,
      );
      answerApi(() =>
        Promise.resolve({
          revision: 4,
          updatedAt: '2026-10-24T08:05:00.000Z',
          page: detail.page,
          checks: detail.checks,
        }),
      );
      const link = outsideLink();
      link.href = `/sites/${SITE_ID}/pages/${PAGE_ID}/seo?focus=title`;
      await user.type(screen.getByRole('textbox', { name: 'Mô tả ngắn' }), 'Tư vấn miễn phí');
      await user.click(link);

      // Another query is another place on the screen (a field to focus): it is not swallowed.
      await waitFor(() => {
        expect(router.push).toHaveBeenCalledWith(
          `/sites/${SITE_ID}/pages/${PAGE_ID}/seo?focus=title`,
        );
      });
      link.remove();
    });

    it('calls off a leave still waiting for its save when a link to this very URL is clicked', async () => {
      const user = userEvent.setup();
      const detail = renderScreen();
      const here = `/sites/${SITE_ID}/pages/${PAGE_ID}/seo`;
      window.history.replaceState(window.history.state, '', here);
      const answerSave = heldSave(detail);
      const away = outsideLink();
      await user.type(screen.getByRole('textbox', { name: 'Mô tả ngắn' }), 'Tư vấn miễn phí');
      await user.click(away);
      await waitFor(() => {
        expect(apiMock).toHaveBeenCalledWith(endpoints.saveDraft, [PAGE_ID], expect.anything());
      });

      // A plain link (breadcrumb, sidebar) to the URL already open: the router handles it.
      const toHere = outsideLink();
      toHere.href = here;
      expect(clickAndSee(toHere)).toBe(false);
      answerSave();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(router.push).not.toHaveBeenCalled();
      away.remove();
      toHere.remove();
    });

    it('calls off a leave still waiting for its save when the tab of this very page is clicked', async () => {
      const user = userEvent.setup();
      const detail = renderScreen();
      window.history.replaceState(
        window.history.state,
        '',
        `/sites/${SITE_ID}/pages/${PAGE_ID}/seo`,
      );
      const answerSave = heldSave(detail);
      const link = outsideLink();
      await user.type(screen.getByRole('textbox', { name: 'Mô tả ngắn' }), 'Tư vấn miễn phí');
      await user.click(link);
      await waitFor(() => {
        expect(apiMock).toHaveBeenCalledWith(endpoints.saveDraft, [PAGE_ID], expect.anything());
      });

      // The user changes their mind and stays: the last place asked for is this screen.
      await user.click(screen.getByRole('link', { name: 'SEO & chia sẻ' }));
      answerSave();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(router.push).not.toHaveBeenCalled();
      link.remove();
    });

    it('opens the reload dialog, not an error, when the draft changed elsewhere', async () => {
      const user = userEvent.setup();
      renderScreen();
      answerApi((endpoint) =>
        endpoint === endpoints.saveDraft
          ? Promise.reject(apiError(409, 'revision_conflict', 'Bản nháp đã thay đổi'))
          : Promise.resolve(),
      );
      const link = outsideLink();
      await user.type(screen.getByRole('textbox', { name: 'Mô tả ngắn' }), 'Tư vấn miễn phí');
      await user.click(link);

      expect(
        await screen.findByRole('alertdialog', { name: 'Trang vừa được cập nhật ở nơi khác' }),
      ).toBeInTheDocument();
      expect(screen.queryByText('Chưa lưu được thiết lập SEO')).toBeNull();
      expect(router.push).not.toHaveBeenCalled();
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

    it('stays when the save before going Back fails', async () => {
      const user = userEvent.setup();
      renderScreen();
      answerApi(() => Promise.reject(apiError(503, 'internal', 'Máy chủ đang bận')));
      const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
      try {
        await user.type(screen.getByRole('textbox', { name: 'Mô tả ngắn' }), 'Tư vấn miễn phí');
        pressBack();

        expect(await screen.findByText('Chưa lưu được thiết lập SEO')).toBeInTheDocument();
        expect(back).not.toHaveBeenCalled();
        expect(screen.getByRole('textbox', { name: 'Mô tả ngắn' })).toHaveValue('Tư vấn miễn phí');
      } finally {
        back.mockRestore();
      }
    });

    it('stays put for the skip link and for Back from it to the same URL', async () => {
      const user = userEvent.setup();
      renderScreen();
      answerApi(() => Promise.reject(apiError(503, 'internal', 'Máy chủ đang bận')));
      const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
      const routerListener = vi.fn();
      window.addEventListener('popstate', routerListener);
      try {
        await user.type(screen.getByRole('textbox', { name: 'Mô tả ngắn' }), 'Tư vấn miễn phí');
        // The skip link: a new entry of this page at #main-content, then popstate.
        window.history.pushState(window.history.state, '', '#main-content');
        window.dispatchEvent(new PopStateEvent('popstate'));
        // Back: the URL the changes were made on, without the fragment.
        window.history.replaceState(window.history.state, '', START_URL);
        window.dispatchEvent(new PopStateEvent('popstate'));
        await new Promise((resolve) => setTimeout(resolve, 0));

        // Neither left the page: no save to leave, no going back, no toast.
        expect(routerListener).toHaveBeenCalledTimes(2);
        expect(apiMock).not.toHaveBeenCalledWith(endpoints.saveDraft, [PAGE_ID], expect.anything());
        expect(back).not.toHaveBeenCalled();
        expect(screen.queryByText('Chưa lưu được thiết lập SEO')).toBeNull();
      } finally {
        window.removeEventListener('popstate', routerListener);
        back.mockRestore();
      }
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
        pressBack({ previous: true });

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

  describe('with a slug still being checked', () => {
    const saved = (detail: PageDetailResponse) => ({
      revision: 4,
      updatedAt: '2026-10-24T08:05:00.000Z',
      page: detail.page,
      checks: detail.checks,
    });

    /** The server's answer about a slug; saves succeed. */
    function answerSlug(detail: PageDetailResponse, availability: () => Promise<unknown>) {
      answerApi((endpoint) =>
        endpoint === endpoints.slugAvailability ? availability() : Promise.resolve(saved(detail)),
      );
    }

    function free(slug: string) {
      return () => Promise.resolve({ slug, available: true, reason: null, message: null });
    }

    /** Types a new slug and leaves before the typing pause is over. */
    async function typeSlug(user: ReturnType<typeof userEvent.setup>, slug: string) {
      const input = screen.getByRole('textbox', { name: 'Đường dẫn trang' });
      await user.clear(input);
      await user.type(input, slug);
    }

    function savedSlugs(): unknown[] {
      return apiMock.mock.calls
        .filter(([endpoint]) => endpoint === endpoints.saveDraft)
        .map((call) => (call as unknown[])[2])
        .map((options) => (options as { body: { slug: string } }).body.slug);
    }

    it('checks and saves the typed slug before following a link', async () => {
      const user = userEvent.setup();
      const detail = renderScreen();
      answerSlug(detail, free('uu-dai-tet'));
      await typeSlug(user, 'uu-dai-tet');
      // Nothing reached the draft yet: the store alone would let the user go.
      expect(router.push).not.toHaveBeenCalled();

      await user.click(screen.getByRole('link', { name: 'Mở editor' }));

      await waitFor(() => {
        expect(router.push).toHaveBeenCalledWith(`/sites/${SITE_ID}/pages/${PAGE_ID}/edit`);
      });
      expect(savedSlugs()).toEqual(['uu-dai-tet']);
    });

    it('stays and says why when the slug is taken, with a way to leave without it', async () => {
      const user = userEvent.setup();
      const detail = renderScreen();
      answerSlug(detail, () =>
        Promise.resolve({
          slug: 'bang-gia',
          available: false,
          reason: 'taken',
          message: 'Đường dẫn này đang được trang “Bảng giá” dùng',
        }),
      );
      await typeSlug(user, 'bang-gia');

      await user.click(screen.getByRole('link', { name: 'Mở editor' }));

      expect(await screen.findByText('Chưa lưu được đường dẫn trang')).toBeInTheDocument();
      expect(router.push).not.toHaveBeenCalled();
      expect(savedSlugs()).toEqual([]);
      expect(screen.getByRole('textbox', { name: 'Đường dẫn trang' })).toHaveValue('bang-gia');
      await user.click(screen.getByRole('button', { name: 'Rời trang, bỏ thay đổi' }));
      expect(router.push).toHaveBeenCalledWith(`/sites/${SITE_ID}/pages/${PAGE_ID}/edit`);
    });

    it('follows any later link at once after leaving without the slug, without checking it', async () => {
      const user = userEvent.setup();
      const detail = renderScreen();
      const taken = vi.fn(() =>
        Promise.resolve({
          slug: 'bang-gia',
          available: false,
          reason: 'taken',
          message: 'Đường dẫn này đang được trang “Bảng giá” dùng',
        }),
      );
      answerSlug(detail, taken);
      await typeSlug(user, 'bang-gia');
      await user.click(screen.getByRole('link', { name: 'Mở editor' }));
      await user.click(await screen.findByRole('button', { name: 'Rời trang, bỏ thay đổi' }));
      expect(router.push).toHaveBeenCalledWith(`/sites/${SITE_ID}/pages/${PAGE_ID}/edit`);
      const checks = taken.mock.calls.length;

      // The editor has not shown yet: another link goes at once too, and the slug stays unsaved.
      await user.click(screen.getByRole('link', { name: 'Lịch sử phiên bản' }));
      expect(router.push).toHaveBeenLastCalledWith(`/sites/${SITE_ID}/pages/${PAGE_ID}/history`);
      expect(taken).toHaveBeenCalledTimes(checks);
      expect(savedSlugs()).toEqual([]);
    });

    it('stays when the check cannot reach the server', async () => {
      const user = userEvent.setup();
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const detail = renderScreen();
      answerSlug(detail, () => Promise.reject(new TypeError('Failed to fetch')));
      await typeSlug(user, 'uu-dai-tet');

      await user.click(screen.getByRole('link', { name: 'Mở editor' }));

      expect(await screen.findByText('Chưa lưu được đường dẫn trang')).toBeInTheDocument();
      expect(router.push).not.toHaveBeenCalled();
      expect(savedSlugs()).toEqual([]);
    });

    it('waits for the slug before the browser goes Back', async () => {
      const user = userEvent.setup();
      const detail = renderScreen();
      answerSlug(detail, free('uu-dai-tet'));
      const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
      try {
        await typeSlug(user, 'uu-dai-tet');
        pressBack({ previous: true });

        await waitFor(() => {
          expect(back).toHaveBeenCalledTimes(1);
        });
        expect(savedSlugs()).toEqual(['uu-dai-tet']);
      } finally {
        back.mockRestore();
      }
    });

    it('asks the browser to confirm closing the tab', async () => {
      const user = userEvent.setup();
      const detail = renderScreen();
      answerSlug(detail, () => new Promise(() => undefined));
      await typeSlug(user, 'uu-dai-tet');

      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
    });
  });

  describe('leaving through the sidebar menus', () => {
    const agency: Membership = {
      workspace: { id: WORKSPACE_ID, name: 'Mây Xanh Agency' },
      role: 'owner',
    };
    const clinic: Membership = {
      workspace: { id: '64b0000000000000000000a2', name: 'Phòng khám Gia Đình' },
      role: 'editor',
    };

    /** The real sidebar next to the screen, whose saves fail: the server is down. */
    function renderWithSidebar(memberships: Membership[] = [agency]) {
      const detail = pageDetail();
      answerApi(() => Promise.reject(apiError(503, 'internal', 'Máy chủ đang bận')), detail);
      renderWithProviders(
        <>
          <Sidebar
            user={{ id: '64b0000000000000000000c1', name: 'Ngọc Anh', email: 'ngocanh@mayxanh.vn' }}
            memberships={memberships}
            membership={agency}
            site={site}
            sites={[site]}
            pageCount={1}
            leadCounts={NO_LEADS}
          />
          <SeoScreen
            initial={{ detail, site, assets: [], role: 'editor' }}
            loadedAt={Date.now()}
            focus={null}
          />
        </>,
      );
      return detail;
    }

    /**
     * Page loads begin as the browser does: the page may still ask the user to stay. Records where
     * each load goes, whether the page asked, and the cookies then.
     */
    function recordPageLoads() {
      const loads: Array<{ href: string; prompted: boolean; cookie: string }> = [];
      loadPageMock.mockImplementation((href) => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        loads.push({ href, prompted: event.defaultPrevented, cookie: document.cookie });
      });
      onTestFinished(() => {
        loadPageMock.mockReset();
      });
      return loads;
    }

    it('switches workspace with no prompt from the browser when leaving without the change', async () => {
      const user = userEvent.setup();
      // A user who stayed would be left in this workspace with the cookie naming the other one.
      const loads = recordPageLoads();
      onTestFinished(() => {
        document.cookie = `${WORKSPACE_PREFERENCE_COOKIE}=; Path=/; Max-Age=0`;
      });
      renderWithSidebar([agency, clinic]);
      await user.type(screen.getByRole('textbox', { name: 'Mô tả ngắn' }), 'Tư vấn miễn phí');

      await user.click(screen.getByRole('button', { name: /đổi workspace$/ }));
      await user.click(screen.getByRole('menuitemradio', { name: 'Phòng khám Gia Đình' }));

      expect(await screen.findByText('Chưa lưu được thiết lập SEO')).toBeInTheDocument();
      expect(loadPageMock).not.toHaveBeenCalled();
      expect(document.cookie).not.toContain(`${WORKSPACE_PREFERENCE_COOKIE}=`);
      await user.click(screen.getByRole('button', { name: 'Rời trang, bỏ thay đổi' }));

      expect(loads).toMatchObject([{ href: '/', prompted: false }]);
      expect(loads[0]?.cookie).toContain(`${WORKSPACE_PREFERENCE_COOKIE}=64b0000000000000000000a2`);
    });

    it('signs out with no prompt from the browser when leaving without the change', async () => {
      const user = userEvent.setup();
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      onTestFinished(() => {
        logged.mockRestore();
      });
      const loads = recordPageLoads();
      const detail = renderWithSidebar();
      // The session ends, but the router cannot open the login page: a page load opens it.
      answerApi(
        (endpoint) =>
          endpoint === endpoints.logout
            ? Promise.resolve()
            : Promise.reject(apiError(503, 'internal', 'Máy chủ đang bận')),
        detail,
      );
      router.replace.mockImplementation(() => {
        throw new Error('The router is not mounted');
      });
      await user.type(screen.getByRole('textbox', { name: 'Mô tả ngắn' }), 'Tư vấn miễn phí');

      await user.click(screen.getByRole('button', { name: /Ngọc Anh/ }));
      await user.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));
      await user.click(await screen.findByRole('button', { name: 'Đăng xuất, bỏ thay đổi' }));

      await waitFor(() => {
        expect(loads).toMatchObject([{ href: '/login', prompted: false }]);
      });
    });

    it('saves first, and offers to sign out without the change when the save fails', async () => {
      const user = userEvent.setup();
      renderScreen();
      answerApi(() => Promise.reject(apiError(503, 'internal', 'Máy chủ đang bận')));
      const signOut = vi.fn((): LeaveOutcome => 'leaving');
      await user.type(screen.getByRole('textbox', { name: 'Mô tả ngắn' }), 'Tư vấn miễn phí');

      leaveScreen(signOut, { discardLabel: 'Đăng xuất, bỏ thay đổi' });

      expect(await screen.findByText('Chưa lưu được thiết lập SEO')).toBeInTheDocument();
      expect(signOut).not.toHaveBeenCalled();
      expect(apiMock).toHaveBeenCalledWith(endpoints.saveDraft, [PAGE_ID], expect.anything());
      await user.click(screen.getByRole('button', { name: 'Đăng xuất, bỏ thay đổi' }));
      expect(signOut).toHaveBeenCalledTimes(1);
    });

    it('follows a link at once while signing out without the change, and keeps it when that fails', async () => {
      const user = userEvent.setup();
      renderScreen();
      answerApi(() => Promise.reject(apiError(503, 'internal', 'Máy chủ đang bận')));
      let stay: () => void = () => undefined;
      const signOut = vi.fn(
        () =>
          new Promise<LeaveOutcome>((resolve) => {
            stay = () => {
              resolve('stayed');
            };
          }),
      );
      await user.type(screen.getByRole('textbox', { name: 'Mô tả ngắn' }), 'Tư vấn miễn phí');
      leaveScreen(signOut, { discardLabel: 'Đăng xuất, bỏ thay đổi' });
      await user.click(await screen.findByRole('button', { name: 'Đăng xuất, bỏ thay đổi' }));
      expect(signOut).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(screen.queryByText('Chưa lưu được thiết lập SEO')).toBeNull();
      });
      const saves = savesSent();

      // Signing out takes a while; the user follows a link meanwhile. They chose to leave without
      // the change, so nothing is saved first.
      await user.click(screen.getByRole('link', { name: 'Mở editor' }));
      expect(router.push).toHaveBeenCalledWith(`/sites/${SITE_ID}/pages/${PAGE_ID}/edit`);
      expect(savesSent()).toBe(saves);
      expect(screen.queryByText('Chưa lưu được thiết lập SEO')).toBeNull();

      // Signing out failed before the editor showed: the user is still here, with the change. The
      // tab asks again, and a link saves first again.
      stay();
      await waitFor(() => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
      });
      expect(screen.getByRole('textbox', { name: 'Mô tả ngắn' })).toHaveValue('Tư vấn miễn phí');
      await user.click(screen.getByRole('link', { name: 'Lịch sử phiên bản' }));
      expect(await screen.findByText('Chưa lưu được thiết lập SEO')).toBeInTheDocument();
      expect(router.push).toHaveBeenCalledTimes(1);
    });

    it('asks before the tab closes again when signing out without the change fails', async () => {
      const user = userEvent.setup();
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      renderWithSidebar();
      await user.type(screen.getByRole('textbox', { name: 'Mô tả ngắn' }), 'Tư vấn miễn phí');

      await user.click(screen.getByRole('button', { name: /Ngọc Anh/ }));
      await user.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));
      await user.click(await screen.findByRole('button', { name: 'Đăng xuất, bỏ thay đổi' }));

      // The server is down: signing out fails too, and the user stays with the change.
      expect(await screen.findByText('Chưa đăng xuất được')).toBeInTheDocument();
      expect(apiMock).toHaveBeenCalledWith(endpoints.logout, []);
      expect(router.replace).not.toHaveBeenCalled();
      expect(screen.getByRole('textbox', { name: 'Mô tả ngắn' })).toHaveValue('Tư vấn miễn phí');
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });

    it('leaves once the save is done', async () => {
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
      const switchSite = vi.fn();
      await user.type(screen.getByRole('textbox', { name: 'Mô tả ngắn' }), 'Tư vấn miễn phí');

      leaveScreen(switchSite);
      expect(switchSite).not.toHaveBeenCalled();

      await waitFor(() => {
        expect(switchSite).toHaveBeenCalledTimes(1);
      });
      expect(apiMock).toHaveBeenCalledWith(endpoints.saveDraft, [PAGE_ID], expect.anything());
    });

    it('leaves at once when everything is saved, and stops taking the menus once gone', () => {
      const { unmount } = renderWithProviders(
        <SeoScreen
          initial={{ detail: pageDetail(), site, assets: [], role: 'editor' }}
          loadedAt={Date.now()}
          focus={null}
        />,
      );
      const leave = vi.fn();
      leaveScreen(leave);
      expect(leave).toHaveBeenCalledTimes(1);
      unmount();
      leaveScreen(leave);
      expect(leave).toHaveBeenCalledTimes(2);
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

    it('offers to reload when a teammate saved and published a newer version first', async () => {
      const user = userEvent.setup();
      const { detail } = liveDetail();
      const published = {
        ...detail,
        draft: { ...detail.draft, revision: detail.draft.revision + 1 },
        page: {
          ...detail.page,
          liveRelease: {
            id: '64b000000000000000000202',
            version: 13,
            slug: 'uu-dai-thang-11',
            publishedAt: '2026-10-24T07:00:00.000Z',
          },
          latestVersion: 13,
        },
      };
      let reads = 0;
      apiMock.mockImplementation((endpoint) => {
        if (endpoint === endpoints.getPage) {
          reads += 1;
          return Promise.resolve(reads === 1 ? detail : published);
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

      await user.click(screen.getByRole('button', { name: 'Tùy chọn khác' }));
      await user.click(screen.getByRole('menuitem', { name: 'Gỡ xuất bản' }));
      const dialog = screen.getByRole('alertdialog');
      await user.type(within(dialog).getByRole('textbox', { name: /Lý do/ }), 'Hết chương trình');
      const confirm = within(dialog).getAllByRole('button', { name: 'Gỡ xuất bản' }).at(-1);
      if (confirm === undefined) {
        throw new Error('confirm button missing');
      }
      await user.click(confirm);
      // The newer draft cannot be shown under this one: the reload dialog says so at once.
      expect(
        await screen.findByRole('alertdialog', { name: 'Trang vừa được cập nhật ở nơi khác' }),
      ).toBeInTheDocument();
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
