import { describe, expect, it } from 'vitest';
import { toastPlacement } from './placement';

// A 1440 × 900 window; the stack is 380 × 60 px at the bottom right corner.
const STACK = { top: 824, bottom: 884, left: 1044, right: 1424 };
const box = (top: number, left: number, height = 36, width = 140) => ({
  top,
  bottom: top + height,
  left,
  right: left + width,
});

describe('toastPlacement', () => {
  it('keeps the bottom corner when the focused control is elsewhere', () => {
    expect(toastPlacement(box(400, 600), STACK, 900)).toBe('bottom');
    // Beside the stack, or just above it.
    expect(toastPlacement(box(840, 880), STACK, 900)).toBe('bottom');
    expect(toastPlacement(box(780, 1100), STACK, 900)).toBe('bottom');
  });

  it('moves to the top corner when the control is under the bottom one', () => {
    expect(toastPlacement(box(840, 1060), STACK, 900)).toBe('top');
    // Only partly under it.
    expect(toastPlacement(box(800, 1000), STACK, 900)).toBe('top');
  });

  it('stays at the bottom when the top corner would cover the control too', () => {
    expect(toastPlacement(box(10, 1100, 880), STACK, 900)).toBe('bottom');
  });

  it('works from where the stack is now, at the top as well', () => {
    const atTop = { top: 16, bottom: 76, left: 1044, right: 1424 };
    expect(toastPlacement(box(840, 1060), atTop, 900)).toBe('top');
    expect(toastPlacement(box(30, 1100), atTop, 900)).toBe('bottom');
  });
});
