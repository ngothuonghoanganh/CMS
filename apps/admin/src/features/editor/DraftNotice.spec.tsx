import { type Asset, endpoints, type PageDetailResponse } from '@plp/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { ApiError, api } from '../../lib/api';
import type * as ApiModule from '../../lib/api';
import { ConflictDialog } from './ConflictDialog';
import { DraftNotice } from './DraftNotice';
import { currentSaveResponse } from './store';
import {
  asset,
  makeStore,
  pageDetail,
  RELEASE_ID,
  sampleComposition,
  SITE_ID,
} from './test-fixtures';
import { renderEditor } from './test-render';

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return { ...actual, api: vi.fn() };
});

const apiMock = vi.mocked(api) as unknown as Mock<
  (endpoint: unknown, args: string[], options?: { body?: unknown }) => Promise<unknown>
>;

const liveRelease = {
  id: RELEASE_ID,
  version: 12,
  slug: 'uu-dai-thang-11',
  publishedAt: '2026-10-20T08:00:00.000Z',
};

function liveStore() {
  return makeStore({
    detail: pageDetail(sampleComposition(), {
      status: { kind: 'live_with_changes', changeCount: 4, changes: [] },
      liveRelease,
      latestVersion: 12,
      liveUrl: 'https://go.smilecare.vn/uu-dai-thang-11',
    }),
  });
}

const NEW_ASSET: Asset = { ...asset, id: '64b0000000000000000000ab', alt: 'Phòng khám mới' };

/** A draft whose Hero shows NEW_ASSET, which the editor did not load yet. */
function draftWithNewImage(revision: number, overrides: Parameters<typeof pageDetail>[1] = {}) {
  const composition = sampleComposition();
  const hero = composition.sections[1];
  if (hero) {
    hero.content = {
      ...hero.content,
      image: { assetId: NEW_ASSET.id, alt: NEW_ASSET.alt, decorative: false },
    };
  }
  const detail = pageDetail(composition, overrides);
  detail.draft.revision = revision;
  return detail;
}

/** Answers the draft request with `detail` and the asset lookup with NEW_ASSET. */
function answerWith(detail: PageDetailResponse) {
  apiMock.mockImplementation((endpoint) =>
    Promise.resolve(
      endpoint === endpoints.listAssets ? { items: [NEW_ASSET], nextCursor: null } : detail,
    ),
  );
}

beforeEach(() => {
  apiMock.mockReset();
});

describe('DraftNotice', () => {
  it('explains that the live page stays unchanged while editing', () => {
    const store = liveStore();
    renderEditor(
      <DraftNotice ensureSaved={() => Promise.resolve(currentSaveResponse(store.getState()))} />,
      {
        store,
      },
    );
    expect(screen.getByText(/Bạn đang sửa/)).toHaveTextContent(
      'Bạn đang sửa bản nháp. Trang live go.smilecare.vn/uu-dai-thang-11 giữ nguyên đến khi bạn xuất bản.',
    );
  });

  it('says the live page keeps its look while the site settings differ from it (ADR-015)', () => {
    const store = makeStore({
      detail: pageDetail(sampleComposition(), {
        status: { kind: 'live', changeCount: 0, changes: [] },
        siteChanges: [{ kind: 'site', label: 'Giao diện site: tên site', sectionId: null }],
        liveRelease,
        latestVersion: 12,
        liveUrl: 'https://go.smilecare.vn/uu-dai-thang-11',
      }),
    });
    renderEditor(
      <DraftNotice ensureSaved={() => Promise.resolve(currentSaveResponse(store.getState()))} />,
      { store },
    );
    expect(screen.getByText(/Bạn đang sửa/)).toHaveTextContent(
      'giữ nguyên đến khi bạn xuất bản. Giao diện site đã đổi sau khi xuất bản v12: trang live vẫn dùng giao diện cũ cho tới khi bạn xuất bản lại.',
    );
    // Nothing differs in the draft, so there is nothing to discard.
    expect(screen.queryByRole('button', { name: 'Hủy thay đổi, quay về bản live' })).toBeNull();
  });

  it('restores the live version into the draft after confirmation', async () => {
    const user = userEvent.setup();
    const store = liveStore();
    store.getState().removeSection('faq000000001');
    const ensureSaved = vi.fn(() =>
      Promise.resolve({ ...currentSaveResponse(store.getState()), revision: 4 }),
    );
    // The API keeps rule 2: the restored draft has a new revision, so it is "live with changes"
    // without any change.
    const restored: PageDetailResponse = pageDetail(sampleComposition(), {
      status: { kind: 'live_with_changes', changeCount: 0, changes: [] },
      liveRelease,
    });
    restored.draft.revision = 5;
    apiMock.mockResolvedValue(restored);
    renderEditor(<DraftNotice ensureSaved={ensureSaved} />, { store });

    await user.click(screen.getByRole('button', { name: 'Hủy thay đổi, quay về bản live' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Quay về bản live v12?' });
    await user.click(within(dialog).getByRole('button', { name: 'Quay về bản live' }));
    await waitFor(() => {
      expect(store.getState().baseRevision).toBe(5);
    });
    expect(ensureSaved).toHaveBeenCalledTimes(1);
    expect(apiMock).toHaveBeenCalledWith(expect.anything(), ['64b000000000000000000002'], {
      body: { baseRevision: 4, releaseId: RELEASE_ID },
    });
    expect(store.getState().draft.composition.sections).toHaveLength(5);
    expect(store.getState().history.past).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Hủy thay đổi, quay về bản live' })).toBeNull();
    // The action that opened the dialog is gone; focus stays on the notice, not on <body>.
    await waitFor(() => {
      expect(document.querySelector('[data-tone="warning"][tabindex="-1"]')).toHaveFocus();
    });
  });

  it('loads the images of the restored draft, so the canvas does not report them missing', async () => {
    const user = userEvent.setup();
    const store = liveStore();
    answerWith(
      draftWithNewImage(5, {
        status: { kind: 'live_with_changes', changeCount: 0, changes: [] },
        liveRelease,
      }),
    );
    renderEditor(
      <DraftNotice ensureSaved={() => Promise.resolve(currentSaveResponse(store.getState()))} />,
      { store },
    );
    await user.click(screen.getByRole('button', { name: 'Hủy thay đổi, quay về bản live' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Quay về bản live v12?' });
    await user.click(within(dialog).getByRole('button', { name: 'Quay về bản live' }));
    await waitFor(() => {
      expect(store.getState().baseRevision).toBe(5);
    });
    expect(store.getState().assetsById[NEW_ASSET.id]).toEqual(NEW_ASSET);
    expect(apiMock).toHaveBeenCalledWith(endpoints.listAssets, [SITE_ID], {
      query: { ids: NEW_ASSET.id },
    });
  });

  it('offers no restore when the draft content already equals the live release', () => {
    const store = makeStore({
      detail: pageDetail(sampleComposition(), {
        status: { kind: 'live_with_changes', changeCount: 0, changes: [] },
        liveRelease,
        latestVersion: 12,
        liveUrl: 'https://go.smilecare.vn/uu-dai-thang-11',
      }),
    });
    renderEditor(<DraftNotice ensureSaved={vi.fn()} />, { store });
    expect(screen.getByText(/Bạn đang sửa/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hủy thay đổi, quay về bản live' })).toBeNull();
  });

  it('says nothing is published before the first release', () => {
    const store = makeStore();
    renderEditor(<DraftNotice ensureSaved={vi.fn()} />, { store });
    expect(
      screen.getByText('Chưa có gì được xuất bản. Bản nháp chỉ nhóm của bạn nhìn thấy.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hủy thay đổi, quay về bản live' })).toBeNull();
  });
});

describe('ConflictDialog', () => {
  it('blocks the editor until the latest draft is reloaded', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store.getState().setSpacing('hero00000001', 'compact');
    store.getState().markConflict();
    const fresh = pageDetail();
    fresh.draft.revision = 8;
    apiMock.mockRejectedValueOnce(
      new ApiError(503, {
        type: 'about:blank',
        title: 'Máy chủ bận',
        status: 503,
        code: 'internal',
      }),
    );
    apiMock.mockResolvedValueOnce(fresh);
    renderEditor(<ConflictDialog />, { store });

    const dialog = screen.getByRole('alertdialog', { name: 'Trang vừa được cập nhật ở nơi khác' });
    expect(within(dialog).queryByRole('button', { name: /Hủy|Đóng/ })).toBeNull();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Tải lại bản mới nhất' }));
    expect(await within(dialog).findByText('Máy chủ bận')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Tải lại bản mới nhất' }));
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
    expect(store.getState()).toMatchObject({ saveState: 'saved', baseRevision: 8 });
    expect(store.getState().draft.composition.sections[1]?.spacing).toBe('normal');
  });

  it('loads the images the reloaded draft uses before showing it', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store.getState().markConflict();
    answerWith(draftWithNewImage(8));
    renderEditor(<ConflictDialog />, { store });

    const dialog = screen.getByRole('alertdialog', { name: 'Trang vừa được cập nhật ở nơi khác' });
    await user.click(within(dialog).getByRole('button', { name: 'Tải lại bản mới nhất' }));
    await waitFor(() => {
      expect(store.getState().baseRevision).toBe(8);
    });
    expect(store.getState().assetsById[NEW_ASSET.id]).toEqual(NEW_ASSET);
    // The asset the editor already knew is not requested again.
    expect(apiMock).toHaveBeenCalledTimes(2);
  });
});
