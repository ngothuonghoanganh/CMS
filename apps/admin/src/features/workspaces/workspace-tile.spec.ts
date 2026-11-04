// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { workspaceTileTone, workspaceTileTones } from './workspace-tile';

const tokens = readFileSync(createRequire(import.meta.url).resolve('@plp/ui/tokens.css'), 'utf8');
const pickerCss = readFileSync(join(import.meta.dirname, 'WorkspacePicker.module.css'), 'utf8');

function token(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-f]{6});`, 'i').exec(tokens);
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

const ids = Array.from(
  { length: 40 },
  (_, index) => `64b0000000000000000000${index.toString(16).padStart(2, '0')}`,
);

describe('workspaceTileTone', () => {
  it('gives a workspace the same tone every time', () => {
    for (const id of ids) {
      expect(workspaceTileTone(id)).toBe(workspaceTileTone(id));
    }
  });

  it('spreads workspaces over the whole palette', () => {
    const used = new Set(ids.map(workspaceTileTone));
    expect([...used].sort()).toEqual(workspaceTileTones.map((entry) => entry.tone).sort());
  });

  it.each(workspaceTileTones)(
    'keeps the initials of $tone legible (WCAG AA) with the colours the stylesheet uses',
    ({ tone, background, initials }) => {
      expect(contrast(token(initials), token(background))).toBeGreaterThanOrEqual(4.5);
      const rule = new RegExp(`\\.tile-${tone}\\s*\\{([^}]*)\\}`).exec(pickerCss)?.[1] ?? '';
      expect(rule).toContain(`background: var(--${background});`);
      expect(rule).toContain(`color: var(--${initials});`);
    },
  );
});
