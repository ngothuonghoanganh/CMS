/**
 * Navigation in code from outside the screen on display: the sidebar's workspace and site
 * switchers, "Tạo site mới" and "Đăng xuất". A screen that holds changes not saved yet (the page's
 * SEO settings) registers here how to leave it: save first, and when that fails keep the user,
 * with a way to leave anyway (ADR-008). Its links and the browser's Back/Forward are taken by the
 * screen itself (`history-guard`).
 */

/**
 * What became of a leave. `'leaving'`: a navigation or page load is under way, and the screen goes
 * away when it lands (the router never keeps it: a failed client navigation becomes a full page
 * load). `'stayed'`: the user is still on the screen, e.g. signing out failed and they were told.
 */
export type LeaveOutcome = 'leaving' | 'stayed';

/**
 * Takes the user away from the screen and reports whether it did, so a screen that gave its
 * changes up for this leave takes them back when the user stays. Never rejects: a failure is
 * shown and reported where it happens.
 */
export type Leave = () => LeaveOutcome | Promise<LeaveOutcome>;

export interface LeaveOptions {
  /** The way out offered when saving fails, e.g. "Đăng xuất, bỏ thay đổi". */
  discardLabel: string;
}

/** Calls `leave` once the screen's changes are saved, or when the user gives them up. */
export type ScreenLeave = (leave: Leave, options: LeaveOptions) => void;

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
  leave: Leave,
  options: LeaveOptions = { discardLabel: LEAVE_WITHOUT_SAVING },
): void {
  if (current === null) {
    // Nothing was given up for this leave, so its outcome changes nothing here.
    void leave();
    return;
  }
  current(leave, options);
}
