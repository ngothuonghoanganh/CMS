import type { SaveDraftResponse } from '@plp/contracts';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installHistoryGuard } from '../shell/history-guard';
import type { Leave } from '../shell/screen-leave';
import { currentSaveResponse, type EditorStore } from './store';
import { makeStore } from './test-fixtures';
import { createDraftSaver, DraftConflictError, type DraftSaver } from './use-draft-saver';
import { isSameDocument, useBeforeUnloadGuard, useLeaveGuard } from './use-leave-guard';

const HERO = 'hero00000001';

// As the root providers do while loading: ahead of the router's listener added in each test.
installHistoryGuard();

function Guarded({
  store,
  ensureSaved,
  discardFor,
  push,
}: {
  store: EditorStore;
  ensureSaved: () => Promise<SaveDraftResponse>;
  discardFor: DraftSaver['discardFor'];
  push: (href: string) => void;
}) {
  const guard = useLeaveGuard(store, { ensureSaved, discardFor }, push);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          guard.navigate('/sites/s/pages/p/history');
        }}
      >
        Lịch sử phiên bản
      </button>
      {guard.dialog}
    </>
  );
}

function setup(ensureSaved?: () => Promise<SaveDraftResponse>) {
  const store = makeStore();
  const discard = vi.fn((leave: Leave) => Promise.resolve(leave()));
  const push = vi.fn();
  const saved = ensureSaved ?? (() => Promise.resolve(currentSaveResponse(store.getState())));
  render(<Guarded store={store} ensureSaved={saved} discardFor={discard} push={push} />);
  return { store, discard, push };
}

/** Where the tests start, and where each one comes back to. */
const START_URL = window.location.href;

/** What the browser does on Back: move to the previous entry (`to`), then fire popstate. */
function pressBack(to = '/sites/s/pages') {
  act(() => {
    window.history.replaceState({ previous: true }, '', to);
    window.dispatchEvent(new PopStateEvent('popstate', { state: { previous: true } }));
  });
}

/** What a click on the skip link does: a new entry of the same page at `#main-content`, then popstate. */
function followSkipLink() {
  act(() => {
    window.history.pushState(window.history.state, '', '#main-content');
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state as unknown }));
  });
}

/** An edit whose autosave failed (network): "Chưa lưu được" until a retry or the next edit. */
function failSave(store: EditorStore) {
  store.getState().setSpacing(HERO, 'compact');
  store.getState().markSaveFailed({ kind: 'retryable', message: 'Không kết nối được máy chủ' });
}

function BeforeUnloadGuarded({
  store,
  pendingInput,
}: {
  store: EditorStore;
  pendingInput?: () => boolean;
}) {
  useBeforeUnloadGuard(store, pendingInput);
  return null;
}

/** Closing or reloading the tab; returns whether the page asked the browser to confirm. */
function closeTab(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', START_URL);
});

describe('useBeforeUnloadGuard', () => {
  it.each([
    [
      'an edit waiting for autosave',
      (store: EditorStore) => {
        store.getState().setSpacing(HERO, 'compact');
      },
    ],
    [
      'a save on its way',
      (store: EditorStore) => {
        store.getState().setSpacing(HERO, 'compact');
        store.getState().markSaving();
      },
    ],
    ['a failed save', failSave],
  ])('asks before the tab closes with %s', (_state, reach) => {
    const store = makeStore();
    render(<BeforeUnloadGuarded store={store} />);
    reach(store);
    expect(closeTab()).toBe(true);
  });

  it('lets the tab close during a leave without saving, a slug still being checked too', () => {
    const store = makeStore();
    render(<BeforeUnloadGuarded store={store} pendingInput={() => true} />);
    failSave(store);
    void createDraftSaver(store).discardFor(() => 'leaving');
    expect(closeTab()).toBe(false);
  });

  it('asks again once a leave without saving stays', async () => {
    const store = makeStore();
    render(<BeforeUnloadGuarded store={store} pendingInput={() => true} />);
    failSave(store);
    let stay: () => void = () => undefined;
    const left = createDraftSaver(store).discardFor(
      () =>
        new Promise((resolve) => {
          stay = () => {
            resolve('stayed');
          };
        }),
    );
    expect(closeTab()).toBe(false);

    stay();
    await left;
    expect(closeTab()).toBe(true);
  });

  it('asks again for a change made after a leave without saving that kept the screen', async () => {
    const store = makeStore();
    render(<BeforeUnloadGuarded store={store} />);
    failSave(store);
    // The way out went to the URL already open: the leave reports 'leaving', yet the screen stays.
    await createDraftSaver(store).discardFor(() => 'leaving');
    expect(closeTab()).toBe(false);

    store.getState().setSpacing(HERO, 'spacious');
    expect(closeTab()).toBe(true);
  });

  it('lets the tab close when everything is saved, and stops asking once unmounted', () => {
    const store = makeStore();
    const { unmount } = render(<BeforeUnloadGuarded store={store} />);
    expect(closeTab()).toBe(false);

    store.getState().setSpacing(HERO, 'compact');
    unmount();
    expect(closeTab()).toBe(false);
  });
});

describe('isSameDocument', () => {
  const page = 'https://admin.example/sites/s/pages/p/seo?focus=title';

  it('is the same document whatever the fragment', () => {
    expect(isSameDocument(page, `${page}#main-content`)).toBe(true);
    expect(isSameDocument(`${page}#main-content`, page)).toBe(true);
    expect(isSameDocument(page, page)).toBe(true);
  });

  it('is not when the path, the query or the origin changes', () => {
    expect(isSameDocument(page, 'https://admin.example/sites/s/pages/p/seo#x')).toBe(false);
    expect(isSameDocument(page, 'https://admin.example/sites/s/pages/p/history')).toBe(false);
    expect(isSameDocument(page, 'https://other.example/sites/s/pages/p/seo?focus=title#x')).toBe(
      false,
    );
  });
});

describe('useLeaveGuard with the browser Back button', () => {
  it('lets Back through when everything is saved', () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    const later = vi.fn();
    window.addEventListener('popstate', later);
    setup();
    pressBack();
    expect(later).toHaveBeenCalledTimes(1);
    expect(pushState).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    window.removeEventListener('popstate', later);
  });

  it('lets a skip link or another in-page fragment through with unsaved changes', () => {
    const router = vi.fn();
    window.addEventListener('popstate', router);
    const { store } = setup();
    store.getState().setSpacing(HERO, 'compact');
    try {
      followSkipLink();
      expect(router).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('dialog')).toBeNull();
    } finally {
      window.removeEventListener('popstate', router);
    }
  });

  it('lets Back from the skip link through to the same URL, with unsaved changes', () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    const router = vi.fn();
    window.addEventListener('popstate', router);
    const { store } = setup();
    const editorUrl = window.location.href;
    // The changes became unsaved on this very URL: Back from the skip link lands on it again.
    store.getState().setSpacing(HERO, 'compact');
    try {
      followSkipLink();
      pressBack(editorUrl);
      expect(router).toHaveBeenCalledTimes(2);
      expect(window.location.href).toBe(editorUrl);
      // Only the skip link added an entry; the guard put none back.
      expect(pushState).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('dialog')).toBeNull();
    } finally {
      window.removeEventListener('popstate', router);
    }
  });

  it('keeps the router from leaving with unsaved changes, restores the entry and asks', () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    const router = vi.fn();
    window.addEventListener('popstate', router);
    const { store } = setup();
    const editorState = window.history.state as unknown;
    const editorUrl = window.location.href;
    store.getState().setSpacing(HERO, 'compact');

    pressBack();
    expect(router).not.toHaveBeenCalled();
    expect(pushState).toHaveBeenCalledWith(editorState, '', editorUrl);
    expect(screen.getByRole('dialog', { name: 'Rời editor khi chưa lưu xong?' })).toBeVisible();
    window.removeEventListener('popstate', router);
  });

  it('goes back without saving when asked, and the next popstate passes', async () => {
    const user = userEvent.setup();
    vi.spyOn(window.history, 'pushState');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const router = vi.fn();
    window.addEventListener('popstate', router);
    const { store, discard } = setup();
    store.getState().setSpacing(HERO, 'compact');
    pressBack();

    await user.click(screen.getByRole('button', { name: 'Rời trang, bỏ thay đổi' }));
    expect(discard).toHaveBeenCalledTimes(1);
    expect(back).toHaveBeenCalledTimes(1);
    pressBack();
    expect(router).toHaveBeenCalledTimes(1);
    window.removeEventListener('popstate', router);
  });

  it('saves, then goes back', async () => {
    const user = userEvent.setup();
    vi.spyOn(window.history, 'pushState');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const ensureSaved = vi.fn(() => Promise.resolve({} as SaveDraftResponse));
    const { store, discard } = setup(ensureSaved);
    store.getState().setSpacing(HERO, 'compact');
    pressBack();

    await user.click(screen.getByRole('button', { name: 'Lưu rồi rời trang' }));
    await waitFor(() => {
      expect(back).toHaveBeenCalledTimes(1);
    });
    expect(ensureSaved).toHaveBeenCalledTimes(1);
    expect(discard).not.toHaveBeenCalled();
  });

  it('stays on "Ở lại"', async () => {
    const user = userEvent.setup();
    vi.spyOn(window.history, 'pushState');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const { store } = setup();
    store.getState().setSpacing(HERO, 'compact');
    pressBack();
    await user.click(screen.getByRole('button', { name: 'Ở lại' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(back).not.toHaveBeenCalled();
  });
});

describe('useLeaveGuard with links', () => {
  it('leaves without saving through discardFor, so unmounting does not save either', async () => {
    const user = userEvent.setup();
    const { store, discard, push } = setup();
    store.getState().setSpacing(HERO, 'compact');
    await user.click(screen.getByRole('button', { name: 'Lịch sử phiên bản' }));
    await user.click(screen.getByRole('button', { name: 'Rời trang, bỏ thay đổi' }));
    expect(discard).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/sites/s/pages/p/history');
  });

  it('closes on a conflict instead of blaming the connection', async () => {
    const user = userEvent.setup();
    const ensureSaved = vi.fn(() => Promise.reject(new DraftConflictError()));
    const { store, push } = setup(ensureSaved);
    store.getState().setSpacing(HERO, 'compact');
    await user.click(screen.getByRole('button', { name: 'Lịch sử phiên bản' }));
    await user.click(screen.getByRole('button', { name: 'Lưu rồi rời trang' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it('follows a link at once during a leave without saving', async () => {
    const user = userEvent.setup();
    const { store, push } = setup();
    failSave(store);
    // A leave said it was under way, but the editor is still here.
    void createDraftSaver(store).discardFor(() => 'leaving');

    await user.click(screen.getByRole('button', { name: 'Lịch sử phiên bản' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(push).toHaveBeenCalledWith('/sites/s/pages/p/history');
  });

  it('asks before a link again once a leave without saving stayed', async () => {
    const user = userEvent.setup();
    const { store, push } = setup();
    failSave(store);
    await createDraftSaver(store).discardFor(() => 'stayed');

    await user.click(screen.getByRole('button', { name: 'Lịch sử phiên bản' }));
    expect(screen.getByRole('dialog', { name: 'Rời editor khi chưa lưu xong?' })).toBeVisible();
    expect(push).not.toHaveBeenCalled();
  });

  it('asks before a link again for a change made after a leave without saving', async () => {
    const user = userEvent.setup();
    const { store, push } = setup();
    failSave(store);
    await createDraftSaver(store).discardFor(() => 'leaving');
    store.getState().setSpacing(HERO, 'spacious');

    await user.click(screen.getByRole('button', { name: 'Lịch sử phiên bản' }));
    expect(screen.getByRole('dialog', { name: 'Rời editor khi chưa lưu xong?' })).toBeVisible();
    expect(push).not.toHaveBeenCalled();
  });

  it('explains a failed save and stays', async () => {
    const user = userEvent.setup();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ensureSaved = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    const { store, push } = setup(ensureSaved);
    store.getState().setSpacing(HERO, 'compact');
    await user.click(screen.getByRole('button', { name: 'Lịch sử phiên bản' }));
    await user.click(screen.getByRole('button', { name: 'Lưu rồi rời trang' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Chưa lưu được bản nháp. Không kết nối được máy chủ. Kiểm tra kết nối mạng rồi thử lại.',
    );
    expect(push).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledWith(
      'Saving the draft before leaving the editor failed',
      expect.any(TypeError),
    );
  });
});

describe('useLeaveGuard after a failed save', () => {
  it('asks before following a link', async () => {
    const user = userEvent.setup();
    const { store, push } = setup();
    failSave(store);
    await user.click(screen.getByRole('button', { name: 'Lịch sử phiên bản' }));
    expect(screen.getByRole('dialog', { name: 'Rời editor khi chưa lưu xong?' })).toBeVisible();
    expect(push).not.toHaveBeenCalled();
  });

  it('keeps the router from going Back and asks', () => {
    vi.spyOn(window.history, 'pushState');
    const router = vi.fn();
    window.addEventListener('popstate', router);
    const { store, push } = setup();
    failSave(store);
    pressBack();
    expect(router).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Rời editor khi chưa lưu xong?' })).toBeVisible();
    expect(push).not.toHaveBeenCalled();
    window.removeEventListener('popstate', router);
  });
});
