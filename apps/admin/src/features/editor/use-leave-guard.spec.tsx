import type { SaveDraftResponse } from '@plp/contracts';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installHistoryGuard } from '../shell/history-guard';
import { currentSaveResponse, type EditorStore } from './store';
import { makeStore } from './test-fixtures';
import { DraftConflictError } from './use-draft-saver';
import { useLeaveGuard } from './use-leave-guard';

const HERO = 'hero00000001';

// As the root providers do while loading: ahead of the router's listener added in each test.
installHistoryGuard();

function Guarded({
  store,
  ensureSaved,
  discard,
  push,
}: {
  store: EditorStore;
  ensureSaved: () => Promise<SaveDraftResponse>;
  discard: () => void;
  push: (href: string) => void;
}) {
  const guard = useLeaveGuard(store, { ensureSaved, discard }, push);
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
  const discard = vi.fn();
  const push = vi.fn();
  const saved = ensureSaved ?? (() => Promise.resolve(currentSaveResponse(store.getState())));
  render(<Guarded store={store} ensureSaved={saved} discard={discard} push={push} />);
  return { store, discard, push };
}

/** What the browser does on Back: move to the previous entry, then fire popstate. */
function pressBack() {
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate', { state: { previous: true } }));
  });
}

afterEach(() => {
  vi.restoreAllMocks();
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
  it('discards the changes when leaving without saving, so unmounting does not save them', async () => {
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
