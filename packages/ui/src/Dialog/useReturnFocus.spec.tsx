import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
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
