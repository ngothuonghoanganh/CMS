// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

function token(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-f]{6});`, 'i').exec(css);
  if (!match?.[1]) {
    throw new Error(`Token --${name} is missing or is not a 6-digit hex color`);
  }
  return match[1];
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

// Text/background pairs used by the admin screens; all must meet WCAG AA for normal text.
const textPairs: ReadonlyArray<readonly [string, string]> = [
  ['color-ink', 'color-surface'],
  ['color-ink', 'color-canvas'],
  ['color-ink-2', 'color-surface'],
  ['color-muted', 'color-surface'],
  ['color-muted', 'color-canvas'],
  ['color-primary-ink', 'color-primary-soft'],
  ['color-on-primary', 'color-primary'],
  ['color-success-ink', 'color-success-soft'],
  ['color-warning-ink', 'color-warning-soft'],
  ['color-danger', 'color-danger-soft'],
  ['color-neutral-badge-ink', 'color-neutral-badge-bg'],
  // Added with the base components (badges, callouts, cards, buttons, segmented controls).
  ['color-warning-ink', 'color-warning-badge-bg'],
  ['color-warning-strong-ink', 'color-warning-soft'],
  ['color-danger-ink', 'color-danger-soft'],
  ['color-success-strong-ink', 'color-success-soft'],
  ['color-primary-pressed', 'color-primary-soft'],
  ['color-primary-ink', 'color-primary-tint'],
  ['color-on-primary', 'color-danger'],
  ['color-on-primary', 'color-danger-ink'],
  ['color-on-primary', 'color-primary-ink'],
  ['color-ink-2', 'color-hover'],
  ['color-muted', 'color-hover'],
  ['color-muted', 'color-surface-subtle'],
  ['color-muted', 'color-border'],
];

describe('admin tokens', () => {
  it.each(textPairs)('%s on %s meets WCAG AA (4.5:1)', (foreground, background) => {
    expect(contrast(token(foreground), token(background))).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the focus outline visible against surfaces (3:1)', () => {
    expect(contrast(token('color-primary'), token('color-surface'))).toBeGreaterThanOrEqual(3);
  });

  // Non-text pairs that identify a control or its state (WCAG 1.4.11): input borders on cards and
  // the canvas, the switch's off track and its white thumb, the selected segment's edge on the
  // group, and the drag handle icon on a selected structure row.
  it.each([
    ['color-border-control', 'color-surface'],
    ['color-border-control', 'color-canvas'],
    ['color-border-control', 'color-surface-subtle'],
    ['color-border-control', 'color-hover'],
    ['color-muted', 'color-primary-soft'],
  ] as const)('%s against %s keeps 3:1 for controls', (foreground, background) => {
    expect(contrast(token(foreground), token(background))).toBeGreaterThanOrEqual(3);
  });
});
