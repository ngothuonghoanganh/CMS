import {
  endpoints,
  type HistoryEntry,
  type HistoryResponse,
  type PageSummary,
} from '@plp/contracts';
import { act, screen, waitFor, within } from '@testing-library/react';
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

const rollbackEntry: HistoryEntry = {
  kind: 'pointer',
  activityId: '64b0000000000000000000f1',
  type: 'rolled_back',
  fromVersion: 12,
  toVersion: 11,
  reason: 'Giá mới chưa duyệt',
  by: ngocAnh,
  at: '2026-10-24T10:20:00.000Z',
  undoable: true,
};

const rolledBackHistory = historyFixture([rollbackEntry, releaseEntry(12), releaseEntry(11)], {
  liveReleaseId: releaseId(11),
});

const undoneEntry: HistoryEntry = {
  kind: 'pointer',
  activityId: '64b0000000000000000000f2',
  type: 'rollback_undone',
  fromVersion: 11,
  toVersion: 12,
  reason: null,
  by: ngocAnh,
  at: '2026-10-24T10:25:00.000Z',
  undoable: false,
};

/** The answer of "Hoàn tác khôi phục": v12 is live again. */
const undone = { activityId: undoneEntry.activityId, page: historyPage(), revalidation: 'ok' };

/** The screen as it opens on `history`, with the page summary that goes with it. */
function renderAt(page: PageSummary, history: HistoryResponse) {
  return renderWithProviders(
    <HistoryScreen
      site={siteFixture()}
      initialPage={page}
      initialHistory={history}
      loadedAt={LOADED_AT}
      restoreReleaseId={null}
    />,
  );
}

function listHeading(): HTMLElement {
  return screen.getByRole('heading', { level: 2, name: 'Phiên bản đã xuất bản' });
}

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
    // Announced as it arrives: the description was read out while the draft was being checked.
    expect(await within(dialog).findByRole('status')).toHaveTextContent(
      /2 thay đổi chưa xuất bản sẽ mất\./,
    );
    // The header around the dialog says the same as what the dialog just read.
    expect(screen.getByText('2 thay đổi chưa xuất bản')).toBeInTheDocument();
  });

  it('starts from the check again when the dialog opens again', async () => {
    const user = userEvent.setup();
    const server: ServerState = { page: historyPage(), history: initialHistory };
    serve(server);
    renderScreen();
    const copy = () =>
      user.click(within(card('v11')).getByRole('button', { name: 'Sao chép vào bản nháp' }));
    await copy();
    let dialog = screen.getByRole('alertdialog', { name: 'Sao chép v11 vào bản nháp?' });
    expect(await within(dialog).findByRole('status')).toHaveTextContent(/4 thay đổi/);
    await user.click(within(dialog).getByRole('button', { name: 'Hủy' }));

    // Reopened while the new read is on its way: nothing from the earlier read is shown.
    apiMock.mockImplementationOnce(() => new Promise(() => undefined));
    await copy();
    dialog = screen.getByRole('alertdialog', { name: 'Sao chép v11 vào bản nháp?' });
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      'Đang kiểm tra bản nháp hiện tại…',
    );
  });

  it('keeps the focus on "Sao chép vào bản nháp" while a conflict is read again', async () => {
    const user = userEvent.setup();
    const server: ServerState = { page: historyPage(), history: initialHistory };
    serve(server);
    renderScreen();
    await user.click(within(card('v11')).getByRole('button', { name: 'Sao chép vào bản nháp' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Sao chép v11 vào bản nháp?' });
    expect(await within(dialog).findByRole('status')).toHaveTextContent(/4 thay đổi/);

    let answerRead: () => void = () => undefined;
    apiMock
      .mockImplementationOnce(() =>
        Promise.reject(apiError(409, 'revision_conflict', 'Bản nháp đã thay đổi')),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answerRead = () => {
              resolve({ page: historyPage(), draft: { revision: 10 }, checks: {} });
            };
          }),
      );
    const confirm = within(dialog).getByRole('button', { name: 'Sao chép vào bản nháp' });
    act(() => {
      confirm.focus();
    });
    await user.keyboard('{Enter}');

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Bản nháp vừa được lưu ở nơi khác.',
    );
    // Not usable while the draft is read again, yet focusable: a disabled button loses the focus.
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    expect(confirm).not.toBeDisabled();
    expect(confirm).toHaveFocus();
    await act(async () => {
      answerRead();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(confirm).not.toHaveAttribute('aria-disabled');
    });
    expect(confirm).toHaveFocus();
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

  it('continues from the list when "Hoàn tác khôi phục" takes the banner away', async () => {
    const user = userEvent.setup();
    const server: ServerState = { page: rolledBackPage, history: rolledBackHistory };
    serve(server);
    renderAt(rolledBackPage, rolledBackHistory);
    const undo = screen.getByRole('button', { name: 'Hoàn tác khôi phục' });
    act(() => {
      undo.focus();
    });

    server.page = historyPage();
    server.history = historyFixture([undoneEntry, ...rolledBackHistory.items]);
    apiMock.mockImplementationOnce(() => Promise.resolve(undone));
    await user.keyboard('{Enter}');

    expect(await screen.findByText('Đã hoàn tác khôi phục')).toBeInTheDocument();
    expect(undo).not.toBeInTheDocument();
    expect(listHeading()).toHaveFocus();
  });

  it('continues from the list when the history removes the banner before the page read ends', async () => {
    const user = userEvent.setup();
    let answerPage: () => void = () => undefined;
    const pageHeld = new Promise<void>((resolve) => {
      answerPage = resolve;
    });
    renderAt(rolledBackPage, rolledBackHistory);
    apiMock.mockImplementation(async (endpoint) => {
      if (endpoint === endpoints.undoActivity) {
        return undone;
      }
      if (endpoint === endpoints.history) {
        return historyFixture([undoneEntry, ...rolledBackHistory.items]);
      }
      if (endpoint === endpoints.getPage) {
        await pageHeld;
        return { page: historyPage(), draft: { revision: 9 }, checks: {} };
      }
      throw new Error('unexpected call');
    });
    const undo = screen.getByRole('button', { name: 'Hoàn tác khôi phục' });
    act(() => {
      undo.focus();
    });
    await user.keyboard('{Enter}');

    // The refresh waits for the page read, but the history already took the banner away.
    await waitFor(() => {
      expect(undo).not.toBeInTheDocument();
    });
    await act(async () => {
      answerPage();
      await pageHeld;
    });
    expect(await screen.findByText('Đã hoàn tác khôi phục')).toBeInTheDocument();
    expect(listHeading()).toHaveFocus();
  });

  it('continues from the list after an undo while the rollback panel stays open', async () => {
    const user = userEvent.setup();
    const history = historyFixture(
      [rollbackEntry, releaseEntry(12), releaseEntry(11), releaseEntry(10)],
      { liveReleaseId: releaseId(11) },
    );
    const server: ServerState = { page: rolledBackPage, history };
    serve(server);
    renderAt(rolledBackPage, history);
    await user.click(within(card('v10')).getByRole('button', { name: 'Khôi phục bản này' }));
    expect(screen.getByRole('heading', { name: 'Khôi phục v10 thành bản live?' })).toHaveFocus();

    server.page = historyPage();
    server.history = historyFixture([undoneEntry, ...history.items]);
    apiMock.mockImplementationOnce(() => Promise.resolve(undone));
    await user.click(screen.getByRole('button', { name: 'Hoàn tác khôi phục' }));

    expect(await screen.findByText('Đã hoàn tác khôi phục')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Khôi phục v10 thành bản live?' })).toBeVisible();
    expect(listHeading()).toHaveFocus();
  });

  it('continues from the list when the rollback was undone elsewhere meanwhile', async () => {
    const user = userEvent.setup();
    const server: ServerState = { page: rolledBackPage, history: rolledBackHistory };
    serve(server);
    renderAt(rolledBackPage, rolledBackHistory);

    // A teammate undid it first: the refreshed history has no banner any more.
    server.page = historyPage();
    server.history = historyFixture([undoneEntry, ...rolledBackHistory.items]);
    apiMock.mockImplementationOnce(() =>
      Promise.reject(apiError(409, 'pointer_conflict', 'Trang live vừa được thay đổi')),
    );
    await user.click(screen.getByRole('button', { name: 'Hoàn tác khôi phục' }));

    expect(await screen.findByText('Chưa hoàn tác được')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Hoàn tác khôi phục' })).toBeNull();
    });
    expect(listHeading()).toHaveFocus();
  });

  it('leaves the focus where it is when the history after an undo could not be read', async () => {
    const user = userEvent.setup();
    serve({ page: rolledBackPage, history: rolledBackHistory });
    renderAt(rolledBackPage, rolledBackHistory);

    apiMock.mockImplementation((endpoint) => {
      if (endpoint === endpoints.undoActivity) {
        return Promise.resolve(undone);
      }
      if (endpoint === endpoints.getPage) {
        return Promise.resolve({ page: historyPage(), draft: { revision: 9 }, checks: {} });
      }
      return Promise.reject(new TypeError('Failed to fetch'));
    });
    const undo = screen.getByRole('button', { name: 'Hoàn tác khôi phục' });
    await user.click(undo);
    expect(await screen.findByText('Đã hoàn tác khôi phục')).toBeInTheDocument();
    expect(await screen.findByText(/Không tải lại được lịch sử/)).toBeInTheDocument();
    // The banner (out of date) and its button are still there, and so is the focus.
    expect(undo).toHaveFocus();

    // Later, the rollback panel takes the focus as it opens, and keeps it.
    await user.click(within(card('v12')).getByRole('button', { name: 'Khôi phục bản này' }));
    expect(screen.getByRole('heading', { name: 'Khôi phục v12 thành bản live?' })).toHaveFocus();
  });

  it('keeps the focus in the header when the page is unpublished from it', async () => {
    const user = userEvent.setup();
    const server: ServerState = { page: historyPage(), history: initialHistory };
    serve(server);
    renderScreen();

    await user.click(screen.getByRole('button', { name: 'Tùy chọn khác' }));
    await user.click(screen.getByRole('menuitem', { name: 'Gỡ xuất bản' }));
    const dialog = screen.getByRole('alertdialog');
    await user.type(within(dialog).getByRole('textbox', { name: /Lý do/ }), 'Hết chương trình');

    const unpublished = historyPage({
      status: { kind: 'unpublished', changeCount: 0, changes: [] },
      liveRelease: null,
      liveUrl: null,
    });
    server.page = unpublished;
    server.history = historyFixture(
      [
        {
          kind: 'pointer',
          activityId: '64b0000000000000000000f3',
          type: 'unpublished',
          fromVersion: 12,
          toVersion: null,
          reason: 'Hết chương trình',
          by: ngocAnh,
          at: '2026-10-24T12:00:00.000Z',
          undoable: false,
        },
        ...initialHistory.items,
      ],
      { liveReleaseId: null },
    );
    apiMock.mockImplementationOnce(() =>
      Promise.resolve({
        activityId: '64b0000000000000000000f3',
        page: unpublished,
        revalidation: 'ok',
      }),
    );
    const confirm = within(dialog).getAllByRole('button', { name: 'Gỡ xuất bản' }).at(-1);
    if (confirm === undefined) {
      throw new Error('confirm button missing');
    }
    await user.click(confirm);

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
    // "Tùy chọn khác" exists for a live page only: focus goes to "Mở editor" beside it.
    expect(screen.queryByRole('button', { name: 'Tùy chọn khác' })).toBeNull();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Mở editor' })).toHaveFocus();
    });
  });

  it('keeps the focus in the header when a teammate unpublished first and the read catches up', async () => {
    const user = userEvent.setup();
    const unpublished = historyPage({
      status: { kind: 'unpublished', changeCount: 0, changes: [] },
      liveRelease: null,
      liveUrl: null,
    });
    renderScreen();
    apiMock.mockImplementation((endpoint) => {
      if (endpoint === endpoints.movePointer) {
        return Promise.reject(apiError(409, 'pointer_conflict', 'Trang live vừa được thay đổi'));
      }
      if (endpoint === endpoints.getPage) {
        // The read answers after the dialog closed and gave the focus back to its menu button.
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({ page: unpublished, draft: { revision: 9 }, checks: {} });
          }, 40);
        });
      }
      if (endpoint === endpoints.history) {
        return Promise.resolve(historyFixture(initialHistory.items, { liveReleaseId: null }));
      }
      return Promise.reject(new Error('unexpected call'));
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

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Tùy chọn khác' })).toHaveFocus();
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Tùy chọn khác' })).toBeNull();
    });
    expect(screen.getByRole('link', { name: 'Mở editor' })).toHaveFocus();
  });

  it('shows the newer page and history over what an earlier visit cached', async () => {
    const first = renderScreen();
    expect(screen.getByText('4 thay đổi chưa xuất bản')).toBeInTheDocument();
    first.unmount();

    // Back on the screen seconds later: autosave changed the draft since, and a teammate
    // published v13; the server rendered the screen again with both.
    vi.setSystemTime(LOADED_AT + 5_000);
    renderWithProviders(
      <HistoryScreen
        site={siteFixture()}
        initialPage={historyPage({
          status: { kind: 'live_with_changes', changeCount: 1, changes: [] },
          liveRelease: {
            id: releaseId(13),
            version: 13,
            slug: 'uu-dai-thang-11',
            publishedAt: '2026-10-24T11:59:00.000Z',
          },
          latestVersion: 13,
        })}
        initialHistory={historyFixture([releaseEntry(13), ...initialHistory.items], {
          liveReleaseId: releaseId(13),
        })}
        loadedAt={LOADED_AT + 5_000}
        restoreReleaseId={null}
      />,
      first.queryClient,
    );

    await waitFor(() => {
      expect(screen.getByText('1 thay đổi chưa xuất bản')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Đã xuất bản · 3' })).toBeInTheDocument();
    expect(within(card('v13')).getByText('ĐANG LIVE')).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalled();
  });
});
