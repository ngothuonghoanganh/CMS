/**
 * Navigation in code from outside the screen on display: the sidebar's workspace and site
 * switchers, "Tạo site mới" and "Đăng xuất". A screen that holds changes not saved yet (the page's
 * SEO settings) registers here how to leave it: save first, and when that fails keep the user,
 * with a way to leave anyway (ADR-008). Its links and the browser's Back/Forward are taken by the
 * screen itself (`history-guard`).
 */

export interface LeaveOptions {
  /** The way out offered when saving fails, e.g. "Đăng xuất, bỏ thay đổi". */
  discardLabel: string;
}

/** Calls `leave` once the screen's changes are saved, or when the user gives them up. */
export type ScreenLeave = (leave: () => void, options: LeaveOptions) => void;

export const LEAVE_WITHOUT_SAVING = 'Rời trang, bỏ thay đổi';

let current: ScreenLeave | null = null;

/** The screen on display takes code navigation; returns the function that removes it. */
export function setScreenLeave(next: ScreenLeave): () => void {
  current = next;
  return () => {
    if (current === next) {
      current = null;
    }
  };
}

/** Leaves the screen on display: at once, or after it saved what it still holds. */
export function leaveScreen(
  leave: () => void,
  options: LeaveOptions = { discardLabel: LEAVE_WITHOUT_SAVING },
): void {
  if (current === null) {
    leave();
    return;
  }
  current(leave, options);
}
