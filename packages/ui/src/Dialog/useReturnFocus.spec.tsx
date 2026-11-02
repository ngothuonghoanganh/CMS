import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useReturnFocus } from './useReturnFocus';

/** The event Radix sends as a dialog closes; preventing it keeps Radix's own focus move. */
function closeEvent(): Event {
  return new Event('focusScope.autoFocusOnUnmount', { cancelable: true });
}

function button(name: string, parent: HTMLElement = document.body): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = name;
  parent.append(element);
  return element;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('useReturnFocus', () => {
  it('focuses the opener again and keeps Radix from moving focus after it', () => {
    const opener = button('Thêm section');
    const { result } = renderHook(() => useReturnFocus());
    opener.focus();
    result.current.rememberFocus();
    button('Trong hộp thoại').focus();

    const event = closeEvent();
    result.current.restoreFocus(event);

    expect(opener).toHaveFocus();
    expect(event.defaultPrevented).toBe(true);
  });

  it('remembers one opener per opening: a later close without an opener leaves focus alone', () => {
    const opener = button('Thêm section');
    const { result } = renderHook(() => useReturnFocus());
    opener.focus();
    result.current.rememberFocus();
    result.current.restoreFocus(closeEvent());
    const elsewhere = button('Nơi khác');
    elsewhere.focus();

    const event = closeEvent();
    result.current.restoreFocus(event);

    expect(elsewhere).toHaveFocus();
    expect(event.defaultPrevented).toBe(false);
  });

  it('falls back when nothing had focus as the dialog opened: the page is no opener', () => {
    const fallback = button('Bản nháp');
    const { result } = renderHook(() => useReturnFocus({ current: fallback }));
    (document.activeElement as HTMLElement | null)?.blur();
    result.current.rememberFocus();

    const event = closeEvent();
    result.current.restoreFocus(event);

    expect(fallback).toHaveFocus();
    expect(event.defaultPrevented).toBe(true);
  });

  it('falls back when the opener goes after the dialog closed, with focus still on it', async () => {
    // "Xóa trang": the row of the deleted page goes once the list has read itself again.
    const opener = button('Tùy chọn khác cho Webinar');
    const fallback = button('Tìm trang');
    const { result } = renderHook(() => useReturnFocus({ current: fallback }));
    opener.focus();
    result.current.rememberFocus();
    result.current.restoreFocus(closeEvent());
    expect(opener).toHaveFocus();

    opener.remove();

    await vi.waitFor(() => {
      expect(fallback).toHaveFocus();
    });
  });

  it('leaves focus where the user moved it before the opener went', async () => {
    const opener = button('Tùy chọn khác cho Webinar');
    const fallback = button('Tìm trang');
    const elsewhere = button('Bản nháp');
    const { result } = renderHook(() => useReturnFocus({ current: fallback }));
    opener.focus();
    result.current.rememberFocus();
    result.current.restoreFocus(closeEvent());

    elsewhere.focus();
    opener.remove();
    // A later mutation finds the watch over: focus taken from `elsewhere` stays on `<body>`.
    elsewhere.remove();
    button('Hàng mới');
    await Promise.resolve();

    expect(fallback).not.toHaveFocus();
  });

  it('focuses the main landmark without a fallback, as the opener goes now or later', async () => {
    // "Thu hồi lời mời": the invitation's row goes with the menu that opened the dialog.
    const main = document.createElement('main');
    main.tabIndex = -1;
    document.body.append(main);
    const { result } = renderHook(() => useReturnFocus());

    const gone = button('Tùy chọn khác cho lời mời', main);
    gone.focus();
    result.current.rememberFocus();
    gone.remove();
    result.current.restoreFocus(closeEvent());
    expect(main).toHaveFocus();

    const later = button('Tùy chọn khác cho thành viên', main);
    later.focus();
    result.current.rememberFocus();
    result.current.restoreFocus(closeEvent());
    expect(later).toHaveFocus();
    later.remove();
    await vi.waitFor(() => {
      expect(main).toHaveFocus();
    });
  });

  it('leaves focus to Radix when neither the opener nor the fallback is on the page', () => {
    const opener = button('Quay về bản live');
    const detached = document.createElement('p');
    const { result } = renderHook(() => useReturnFocus({ current: detached }));
    opener.focus();
    result.current.rememberFocus();
    opener.remove();

    const event = closeEvent();
    result.current.restoreFocus(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('returns to a menu item whose menu has no trigger to return to, while it is there', () => {
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-labelledby', 'trigger-gone');
    document.body.append(menu);
    const item = button('Gỡ xuất bản', menu);
    const { result } = renderHook(() => useReturnFocus());
    item.focus();
    result.current.rememberFocus();
    button('Trong hộp thoại').focus();

    result.current.restoreFocus(closeEvent());

    expect(item).toHaveFocus();
  });
});
