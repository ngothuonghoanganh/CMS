import { endpoints, type HistoryResponse, type PageSummary } from '@plp/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { SITE_ID, siteFixture } from '../dashboard/test-fixtures';
import { apiError, lastCallTo, renderWithProviders } from '../shell/test-utils';
import { HistoryScreen } from './HistoryScreen';
import {
  historyFixture,
  historyPage,
  ngocAnh,
  PAGE_ID,
  releaseEntry,
  releaseId,
} from './test-fixtures';

const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const LOADED_AT = Date.parse('2026-10-24T12:00:00.000Z');

const initialHistory = historyFixture([releaseEntry(12), releaseEntry(11)]);

const rolledBackPage = historyPage({
  liveRelease: {
    id: releaseId(11),
    version: 11,
    slug: 'uu-dai-thang-11',
    publishedAt: '2026-10-21T02:40:00.000Z',
  },
});

const rolledBackHistory = historyFixture(
  [
    {
      kind: 'pointer',
      activityId: '64b0000000000000000000f1',
      type: 'rolled_back',
      fromVersion: 12,
      toVersion: 11,
      reason: 'Giá mới chưa duyệt',
      by: ngocAnh,
      at: '2026-10-24T10:20:00.000Z',
      undoable: true,
    },
    releaseEntry(12),
    releaseEntry(11),
  ],
  { liveReleaseId: releaseId(11) },
);

interface ServerState {
  page: PageSummary;
  history: HistoryResponse;
  /** The draft revision the page read answers; 9 unless a test saves the draft elsewhere. */
  revision?: number;
}

/** Answers the screen's reads from `server`, so a test can change what the API returns. */
function serve(server: ServerState) {
  apiMock.mockImplementation((endpoint) => {
    if (endpoint === endpoints.getPage) {
      return Promise.resolve({
        page: server.page,
        draft: { revision: server.revision ?? 9 },
        checks: {},
      });
    }
    if (endpoint === endpoints.history) {
      return Promise.resolve(server.history);
    }
    return Promise.reject(new Error('unexpected call'));
  });
}

function renderScreen(restoreReleaseId: string | null = null) {
  return renderWithProviders(
    <HistoryScreen
      site={siteFixture()}
      initialPage={historyPage()}
      initialHistory={initialHistory}
      loadedAt={LOADED_AT}
      restoreReleaseId={restoreReleaseId}
    />,
  );
}

/** The release entry of a version (a rollback entry may carry the same version heading). */
function card(version: string): HTMLElement {
  const entries = screen
    .getAllByRole('heading', { name: version, level: 3 })
    .map((heading) => heading.closest('li'))
    .filter((entry): entry is HTMLLIElement => entry !== null);
  const release = entries.find(
    (entry) => within(entry).queryByRole('button', { name: 'Sao chép vào bản nháp' }) !== null,
  );
  if (release === undefined) {
    throw new Error(`no release entry for ${version}`);
  }
  return release;
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
  // Only the clock is fixed, so "17:20" stays "today" and the server data stays fresh.
  vi.useFakeTimers({ toFake: ['Date'], now: LOADED_AT });
  apiMock.mockReset();
  router.push.mockReset();
  window.history.replaceState(null, '', `/sites/${SITE_ID}/pages/${PAGE_ID}/history`);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('HistoryScreen', () => {
  it('shows the page header, the tabs and the published versions', () => {
    renderScreen();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Ưu đãi niềng răng tháng 11' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trang' })).toHaveAttribute(
      'href',
      `/sites/${SITE_ID}`,
    );
    expect(screen.getByRole('link', { name: 'Lịch sử phiên bản' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Mở editor' })).toHaveAttribute(
      'href',
      `/sites/${SITE_ID}/pages/${PAGE_ID}/edit`,
    );
    expect(screen.getByText('4 thay đổi chưa xuất bản')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đã xuất bản · 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const live = card('v12');
    expect(within(live).getByText('ĐANG LIVE')).toBeInTheDocument();
    expect(within(live).getByText('Ngọc Anh · 22/10/2026 09:40')).toBeInTheDocument();
    expect(
      within(live).queryByRole('button', { name: 'Khôi phục bản này' }),
    ).not.toBeInTheDocument();
    expect(
      within(card('v11')).getByRole('button', { name: 'Khôi phục bản này' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /Khôi phục v/ })).not.toBeInTheDocument();
  });

  it('opens the rollback panel for the release in ?restore=', () => {
    renderScreen(releaseId(11));
    expect(
      screen.getByRole('region', { name: 'Khôi phục v11 thành bản live?' }),
    ).toBeInTheDocument();
  });

  it('ignores ?restore= for the live release', () => {
    renderScreen(releaseId(12));
    expect(screen.queryByRole('region', { name: /Khôi phục v/ })).not.toBeInTheDocument();
  });

  it('rolls back, shows the banner and undoes the rollback', async () => {
    const user = userEvent.setup();
    const server: ServerState = { page: historyPage(), history: initialHistory };
    serve(server);
    renderScreen();

    await user.click(within(card('v11')).getByRole('button', { name: 'Khôi phục bản này' }));
    const panel = screen.getByRole('region', { name: 'Khôi phục v11 thành bản live?' });
    await user.type(within(panel).getByRole('textbox', { name: /Lý do/ }), 'Giá mới chưa duyệt');

    server.page = rolledBackPage;
    server.history = rolledBackHistory;
    const moved = {
      activityId: '64b0000000000000000000f1',
      page: rolledBackPage,
      revalidation: 'ok',
    };
    apiMock.mockImplementationOnce(() => Promise.resolve(moved));
    // The live region is on the page before the banner is written into it.
    const slot = screen.getByRole('status');
    expect(slot).toBeEmptyDOMElement();
    await user.click(within(panel).getByRole('button', { name: 'Khôi phục v11' }));

    const banner = await screen.findByRole('status', { name: '' });
    expect(banner).toBe(slot);
    await waitFor(() => {
      expect(banner).toHaveTextContent(
        'v11 đang live tại smilecare.payload.site/uu-dai-thang-11 · khôi phục lúc 17:20 bởi Ngọc Anh',
      );
    });
    // A member's own visit from here is flagged, so "Hiệu quả" does not count it (ADR-019).
    expect(within(banner).getByRole('link', { name: /Xem trang live/ })).toHaveAttribute(
      'href',
      'https://smilecare.payload.site/uu-dai-thang-11?plp_internal=1',
    );
    expect(screen.queryByRole('region', { name: /Khôi phục v/ })).not.toBeInTheDocument();
    // The panel that held focus is gone: focus moves to the confirmation, which was written into
    // a live region that was already on the page (so it is announced).
    expect(banner.firstElementChild).toHaveFocus();
    expect(within(card('v11')).getByText('ĐANG LIVE')).toBeInTheDocument();

    server.page = historyPage();
    server.history = historyFixture([
      {
        kind: 'pointer',
        activityId: '64b0000000000000000000f2',
        type: 'rollback_undone',
        fromVersion: 11,
        toVersion: 12,
        reason: null,
        by: ngocAnh,
        at: '2026-10-24T10:25:00.000Z',
        undoable: false,
      },
      ...rolledBackHistory.items,
    ]);
    apiMock.mockImplementationOnce(() =>
      Promise.resolve({
        activityId: '64b0000000000000000000f2',
        page: historyPage(),
        revalidation: 'ok',
      }),
    );
    await user.click(within(banner).getByRole('button', { name: 'Hoàn tác khôi phục' }));

    expect(await screen.findByText('Đã hoàn tác khôi phục')).toBeInTheDocument();
    expect(screen.getByText('v12 đang live trở lại.')).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith(endpoints.undoActivity, ['64b0000000000000000000f1']);
    expect(screen.queryByRole('button', { name: 'Hoàn tác khôi phục' })).not.toBeInTheDocument();
    expect(screen.getByText('HOÀN TÁC')).toBeInTheDocument();
  });

  it('focuses the banner as soon as the history shows the rollback, before the page re-read ends', async () => {
    const user = userEvent.setup();
    const server: ServerState = { page: historyPage(), history: initialHistory };
    serve(server);
    renderScreen();
    await user.click(within(card('v11')).getByRole('button', { name: 'Khôi phục bản này' }));
    const panel = screen.getByRole('region', { name: 'Khôi phục v11 thành bản live?' });
    await user.type(within(panel).getByRole('textbox', { name: /Lý do/ }), 'Giá mới chưa duyệt');

    server.page = rolledBackPage;
    server.history = rolledBackHistory;
    let finishPageRead: () => void = () => undefined;
    const pageRead = new Promise<void>((resolve) => {
      finishPageRead = resolve;
    });
    apiMock.mockImplementation(async (endpoint) => {
      if (endpoint === endpoints.movePointer) {
        return { activityId: '64b0000000000000000000f1', page: rolledBackPage, revalidation: 'ok' };
      }
      if (endpoint === endpoints.history) {
        return server.history;
      }
      if (endpoint === endpoints.getPage) {
        // The page summary answers last, after the history has re-rendered the screen.
        await pageRead;
        return { page: server.page, draft: { revision: 9 }, checks: {} };
      }
      throw new Error('unexpected call');
    });
    await user.click(within(panel).getByRole('button', { name: 'Khôi phục v11' }));

    const banner = screen.getByRole('status');
    await waitFor(() => {
      expect(banner).toHaveTextContent('v11 đang live tại');
    });
    await waitFor(() => {
      expect(banner.firstElementChild).toHaveFocus();
    });
    finishPageRead();
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: /Khôi phục v/ })).not.toBeInTheDocument();
    });
    expect(banner.firstElementChild).toHaveFocus();
  });

  it('hands the focus to the first older entry "Xem thêm" brought, as it goes away', async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation((endpoint) =>
      endpoint === endpoints.history
        ? Promise.resolve(historyFixture([releaseEntry(11)], { releaseCount: 2 }))
        : Promise.reject(new Error('unexpected call')),
    );
    renderWithProviders(
      <HistoryScreen
        site={siteFixture()}
        initialPage={historyPage()}
        initialHistory={historyFixture([releaseEntry(12)], {
          nextCursor: 'cursor-2',
          releaseCount: 2,
        })}
        loadedAt={LOADED_AT}
        restoreReleaseId={null}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Xem thêm 1 phiên bản cũ hơn' }));
    await waitFor(() => {
      expect(within(card('v11')).getAllByRole('button')[0]).toHaveFocus();
    });
    expect(screen.queryByRole('button', { name: /Xem thêm/ })).toBeNull();
  });

  it('returns focus to "Khôi phục bản này" when the panel is cancelled', async () => {
    const user = userEvent.setup();
    serve({ page: historyPage(), history: initialHistory });
    renderScreen();
    const restore = within(card('v11')).getByRole('button', { name: 'Khôi phục bản này' });
    await user.click(restore);
    const panel = screen.getByRole('region', { name: 'Khôi phục v11 thành bản live?' });
    await user.click(within(panel).getByRole('button', { name: 'Hủy' }));
    expect(screen.queryByRole('region', { name: /Khôi phục v/ })).not.toBeInTheDocument();
    expect(restore).toHaveFocus();
  });

  it('focuses the release of a panel opened by ?restore= when it is cancelled', async () => {
    const user = userEvent.setup();
    serve({ page: historyPage(), history: initialHistory });
    renderScreen(releaseId(11));
    const panel = screen.getByRole('region', { name: 'Khôi phục v11 thành bản live?' });
    await user.click(within(panel).getByRole('button', { name: 'Hủy' }));
    expect(within(card('v11')).getByRole('button', { name: 'Khôi phục bản này' })).toHaveFocus();
  });

  it('copies a release into the draft from the revision read when the dialog opened', async () => {
    const user = userEvent.setup();
    serve({ page: historyPage(), history: initialHistory });
    renderScreen();

    await user.click(within(card('v11')).getByRole('button', { name: 'Sao chép vào bản nháp' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Sao chép v11 vào bản nháp?' });
    expect(
      await within(dialog).findByText(/4 thay đổi chưa xuất bản sẽ mất\./),
    ).toBeInTheDocument();

    apiMock.mockImplementationOnce(() =>
      Promise.resolve({ page: historyPage(), draft: { revision: 10 } }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Sao chép vào bản nháp' }));

    expect(await screen.findByText('Đã sao chép v11 vào bản nháp')).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith(endpoints.restoreDraft, [PAGE_ID], {
      body: { baseRevision: 9, releaseId: releaseId(11) },
    });
    await user.click(screen.getByRole('button', { name: 'Mở editor' }));
    expect(router.push).toHaveBeenCalledWith(`/sites/${SITE_ID}/pages/${PAGE_ID}/edit`);
  });

  it('says what a draft saved since the screen loaded will lose before copying over it', async () => {
    const user = userEvent.setup();
    // The screen loaded with the draft equal to the live page; another tab saved since.
    serve({
      page: historyPage({ status: { kind: 'live_with_changes', changeCount: 2, changes: [] } }),
      history: initialHistory,
    });
    renderWithProviders(
      <HistoryScreen
        site={siteFixture()}
        initialPage={historyPage({ status: { kind: 'live', changeCount: 0, changes: [] } })}
        initialHistory={initialHistory}
        loadedAt={LOADED_AT}
        restoreReleaseId={null}
      />,
    );

    await user.click(within(card('v11')).getByRole('button', { name: 'Sao chép vào bản nháp' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Sao chép v11 vào bản nháp?' });
    expect(
      await within(dialog).findByText(/2 thay đổi chưa xuất bản sẽ mất\./),
    ).toBeInTheDocument();
  });

  it('never overwrites a draft saved elsewhere after the dialog read it', async () => {
    const user = userEvent.setup();
    const server: ServerState = { page: historyPage(), history: initialHistory };
    serve(server);
    renderScreen();

    await user.click(within(card('v11')).getByRole('button', { name: 'Sao chép vào bản nháp' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Sao chép v11 vào bản nháp?' });
    expect(
      await within(dialog).findByText(/4 thay đổi chưa xuất bản sẽ mất\./),
    ).toBeInTheDocument();

    // A teammate saves the draft before the owner confirms.
    server.page = historyPage({
      status: { kind: 'live_with_changes', changeCount: 6, changes: [] },
    });
    server.revision = 10;
    apiMock.mockImplementationOnce(() =>
      Promise.reject(apiError(409, 'revision_conflict', 'Bản nháp đã thay đổi')),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Sao chép vào bản nháp' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Bản nháp vừa được lưu ở nơi khác.',
    );
    expect(
      await within(dialog).findByText(/6 thay đổi chưa xuất bản sẽ mất\./),
    ).toBeInTheDocument();
    expect(screen.queryByText('Đã sao chép v11 vào bản nháp')).not.toBeInTheDocument();

    apiMock.mockImplementationOnce(() =>
      Promise.resolve({ page: historyPage(), draft: { revision: 11 } }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Sao chép vào bản nháp' }));
    expect(await screen.findByText('Đã sao chép v11 vào bản nháp')).toBeInTheDocument();
    expect(lastCallTo(apiMock, endpoints.restoreDraft).options).toEqual({
      body: { baseRevision: 10, releaseId: releaseId(11) },
    });
  });

  it('opens a signed preview of a release in a new tab', async () => {
    const user = userEvent.setup();
    const opened = { opener: {} };
    const open = vi.spyOn(window, 'open').mockImplementation(() => opened as unknown as Window);
    apiMock.mockResolvedValueOnce({
      url: 'https://smilecare.payload.site/_preview/token',
      expiresAt: '2026-10-31T00:00:00.000Z',
    });
    renderScreen();

    await user.click(within(card('v11')).getByRole('button', { name: 'Xem bản này' }));

    await vi.waitFor(() => {
      expect(open).toHaveBeenCalledWith('https://smilecare.payload.site/_preview/token', '_blank');
    });
    expect(apiMock).toHaveBeenCalledWith(endpoints.createPreviewLink, [PAGE_ID], {
      body: { kind: 'release', releaseId: releaseId(11) },
    });
    expect(opened.opener).toBeNull();
    open.mockRestore();
  });
});
