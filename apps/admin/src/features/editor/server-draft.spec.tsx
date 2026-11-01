import {
  type Asset,
  endpoints,
  type PageDetailResponse,
  type SaveDraftRequest,
  type SaveDraftResponse,
} from '@plp/contracts';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { ApiError, api } from '../../lib/api';
import type * as ApiModule from '../../lib/api';
import { useLatestServerDraft } from './server-draft';
import { asset, makeStore, pageDetail, sampleComposition } from './test-fixtures';
import { createDraftSaver } from './use-draft-saver';

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return { ...actual, api: vi.fn() };
});

const apiMock = vi.mocked(api) as unknown as Mock<
  (endpoint: unknown, args?: unknown, options?: { body?: SaveDraftRequest }) => Promise<unknown>
>;

const HERO = 'hero00000001';
const NEW_ASSET: Asset = { ...asset, id: '64b0000000000000000000ab' };

/** The server's draft: the Hero heading changed and it shows NEW_ASSET. */
function serverDraft(revision: number): PageDetailResponse {
  const composition = sampleComposition();
  const hero = composition.sections[1];
  if (hero) {
    hero.content = {
      ...hero.content,
      heading: 'Alpha sau khi sửa',
      image: { assetId: NEW_ASSET.id, alt: 'Ảnh', decorative: false },
    };
  }
  const detail = pageDetail(composition, { title: 'Tên mới' });
  detail.draft.revision = revision;
  return detail;
}

function answer(detail: PageDetailResponse | Promise<PageDetailResponse>) {
  apiMock.mockImplementation((endpoint) =>
    endpoint === endpoints.listAssets
      ? Promise.resolve({ items: [NEW_ASSET], nextCursor: null })
      : Promise.resolve(detail),
  );
}

function heading(store: ReturnType<typeof makeStore>) {
  return store.getState().draft.composition.sections[1]?.content.heading;
}

beforeEach(() => {
  apiMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useLatestServerDraft', () => {
  it('replaces a draft restored from a stale payload (Back/Forward) with the newer one', async () => {
    const store = makeStore();
    answer(serverDraft(5));
    renderHook(() => {
      useLatestServerDraft(store);
    });
    await waitFor(() => {
      expect(store.getState().baseRevision).toBe(5);
    });
    expect(heading(store)).toBe('Alpha sau khi sửa');
    expect(store.getState().assetsById[NEW_ASSET.id]).toEqual(NEW_ASSET);
    expect(store.getState().saveState).toBe('saved');
  });

  it('refreshes the page summary when the draft is the same', async () => {
    const store = makeStore();
    const same = pageDetail(undefined, {
      status: { kind: 'unpublished', changeCount: 0, changes: [] },
    });
    answer(same);
    renderHook(() => {
      useLatestServerDraft(store);
    });
    await waitFor(() => {
      expect(store.getState().page.status.kind).toBe('unpublished');
    });
    expect(store.getState().baseRevision).toBe(3);
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  it('never replaces a draft the user already edited; autosave reports a real conflict', async () => {
    const store = makeStore();
    let resolve: (detail: PageDetailResponse) => void = () => undefined;
    answer(
      new Promise<PageDetailResponse>((done) => {
        resolve = done;
      }),
    );
    renderHook(() => {
      useLatestServerDraft(store);
    });
    store.getState().setSpacing(HERO, 'compact');
    resolve(serverDraft(5));
    await new Promise((done) => {
      setTimeout(done, 0);
    });
    expect(store.getState()).toMatchObject({ saveState: 'dirty', baseRevision: 3 });
    expect(store.getState().draft.composition.sections[1]?.spacing).toBe('compact');
    expect(heading(store)).not.toBe('Alpha sau khi sửa');
  });

  it('leaves the store alone when the newer revision is its own autosave', async () => {
    const store = makeStore();
    let resolve: (detail: PageDetailResponse) => void = () => undefined;
    answer(
      new Promise<PageDetailResponse>((done) => {
        resolve = done;
      }),
    );
    renderHook(() => {
      useLatestServerDraft(store);
    });
    store.getState().setSpacing(HERO, 'compact');
    const saved = store.getState().draftVersion;
    store.getState().applySaved(
      {
        revision: 4,
        updatedAt: '2026-10-24T09:00:00.000Z',
        page: store.getState().page,
        checks: store.getState().checks,
      },
      saved,
    );
    const own = pageDetail();
    own.draft.revision = 4;
    resolve(own);
    // Let the hook handle the answer before looking at the store.
    await new Promise((done) => {
      setTimeout(done, 0);
    });
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(store.getState()).toMatchObject({ saveState: 'saved', baseRevision: 4 });
    expect(store.getState().draft.composition.sections[1]?.spacing).toBe('compact');
  });

  it('keeps working on the loaded draft and logs when the check fails', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const store = makeStore();
    apiMock.mockRejectedValue(new TypeError('Failed to fetch'));
    renderHook(() => {
      useLatestServerDraft(store);
    });
    await waitFor(() => {
      expect(logged).toHaveBeenCalledWith(
        'Checking whether the draft changed on the server failed',
        expect.any(TypeError),
      );
    });
    expect(store.getState().baseRevision).toBe(3);
  });

  it('reads the page after the save another screen sent on leaving, so the next save fits', async () => {
    // The server answers a read at once but writes a save only once the test lets it through, as
    // it validates the draft and looks up its images first. A save needs the current revision.
    let server = pageDetail();
    let saveReachesServer: () => void = () => undefined;
    const held = new Promise<void>((done) => {
      saveReachesServer = done;
    });
    apiMock.mockImplementation(async (endpoint, _args, options) => {
      if (endpoint === endpoints.getPage) {
        return structuredClone(server);
      }
      const body = options?.body;
      if (endpoint !== endpoints.saveDraft || body === undefined) {
        throw new Error('Unexpected request');
      }
      await held;
      if (body.baseRevision !== server.draft.revision) {
        throw new ApiError(409, {
          type: 'about:blank',
          title: 'Xung đột',
          status: 409,
          code: 'revision_conflict',
        });
      }
      const { baseRevision, ...draft } = body;
      server = { ...server, draft: { ...server.draft, ...draft, revision: baseRevision + 1 } };
      const saved: SaveDraftResponse = {
        revision: server.draft.revision,
        updatedAt: server.draft.updatedAt,
        page: server.page,
        checks: server.checks,
      };
      return saved;
    });

    // "SEO & chia sẻ": a new search title, then Back before its autosave ran.
    const seo = makeStore();
    const stopSeoSaver = createDraftSaver(seo).start();
    seo.getState().updateSeo({ title: 'Niềng răng trong suốt' });
    stopSeoSaver();

    // The editor comes back from the router's cache and reads the page while that save is sent.
    const editor = makeStore();
    renderHook(() => {
      useLatestServerDraft(editor);
    });
    saveReachesServer();

    await waitFor(() => {
      expect(editor.getState().baseRevision).toBe(4);
    });
    expect(editor.getState().draft.seo.title).toBe('Niềng răng trong suốt');
    editor.getState().setSpacing(HERO, 'compact');
    await expect(createDraftSaver(editor).ensureSaved()).resolves.toMatchObject({ revision: 5 });
    expect(editor.getState().saveState).toBe('saved');
  });
});
