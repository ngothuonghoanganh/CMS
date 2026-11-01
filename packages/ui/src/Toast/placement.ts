/** Where the toast stack sits: the bottom right corner, or the top right one. */
export type ToastPlacement = 'bottom' | 'top';

export interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Distance of the stack from the window's edges (`.viewport` in Toast.module.css). */
const TOAST_INSET = 16;

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * The corner of the stack that leaves the focused control in sight (WCAG 2.4.11): the bottom
 * right as usual, the top right when the control is under the bottom one, and the bottom right
 * again when the control is under both (a control that tall is never entirely covered).
 *
 * `stack` is the stack's box where it is now; only its width, height and left edge are used.
 */
export function toastPlacement(focused: Box, stack: Box, windowHeight: number): ToastPlacement {
  const height = stack.bottom - stack.top;
  const at = (top: number): Box => ({
    top,
    bottom: top + height,
    left: stack.left,
    right: stack.right,
  });
  if (!overlaps(focused, at(windowHeight - TOAST_INSET - height))) {
    return 'bottom';
  }
  return overlaps(focused, at(TOAST_INSET)) ? 'bottom' : 'top';
}
