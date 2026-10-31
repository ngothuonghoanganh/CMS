import { describe, expect, it, vi } from 'vitest';
import { LEAVE_WITHOUT_SAVING, leaveScreen, setScreenLeave } from './screen-leave';

describe('leaveScreen', () => {
  it('leaves at once when no screen holds changes', () => {
    const leave = vi.fn();
    leaveScreen(leave);
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('hands the leave to the screen on display, with the way out to offer', () => {
    const screenLeave = vi.fn();
    const remove = setScreenLeave(screenLeave);
    const leave = vi.fn();

    leaveScreen(leave);
    leaveScreen(leave, { discardLabel: 'Đăng xuất, bỏ thay đổi' });

    expect(leave).not.toHaveBeenCalled();
    expect(screenLeave.mock.calls).toEqual([
      [leave, { discardLabel: LEAVE_WITHOUT_SAVING }],
      [leave, { discardLabel: 'Đăng xuất, bỏ thay đổi' }],
    ]);
    remove();
    leaveScreen(leave);
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('keeps the screen that came next when the previous one goes away after it', () => {
    const removePrevious = setScreenLeave(vi.fn());
    const next = vi.fn();
    const removeNext = setScreenLeave(next);

    removePrevious();
    leaveScreen(vi.fn());

    expect(next).toHaveBeenCalledTimes(1);
    removeNext();
  });
});
