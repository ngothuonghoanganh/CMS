import { describe, expect, it } from 'vitest';

import {
  BUILDER_PANEL_DEFAULT_WIDTHS,
  BUILDER_PANEL_STORAGE_KEYS,
  clampPanelWidth,
  normalizePanelWidths,
  persistPanelWidths,
  readPanelWidths,
} from './builder-panel-size';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  } as Storage;
}

describe('builder panel sizing', () => {
  it('uses stable defaults and clamps both panel limits', () => {
    expect(readPanelWidths(undefined, 1440)).toEqual(BUILDER_PANEL_DEFAULT_WIDTHS);
    expect(clampPanelWidth('left', 1, 1440)).toBe(220);
    expect(clampPanelWidth('right', 9999, 1440, 300)).toBe(586);
  });

  it('keeps the desktop canvas usable when both panels are expanded', () => {
    const widths = normalizePanelWidths({ left: 480, right: 640 }, 1440);
    expect(widths.left).toBe(480);
    expect(widths.right).toBe(406);
    expect(1440 - 134 - widths.left - widths.right).toBeGreaterThanOrEqual(420);
  });

  it('persists independently named left and right preferences', () => {
    const storage = memoryStorage();
    persistPanelWidths(storage, { left: 360, right: 420 });

    expect(storage.getItem(BUILDER_PANEL_STORAGE_KEYS.left)).toBe('360');
    expect(storage.getItem(BUILDER_PANEL_STORAGE_KEYS.right)).toBe('420');
    expect(readPanelWidths(storage, 1440)).toEqual({ left: 360, right: 420 });
  });

  it('ignores invalid persisted values', () => {
    const storage = memoryStorage();
    storage.setItem(BUILDER_PANEL_STORAGE_KEYS.left, 'not-a-width');
    storage.setItem(BUILDER_PANEL_STORAGE_KEYS.right, '-10');

    expect(readPanelWidths(storage, 1440)).toEqual({ left: 300, right: 280 });
  });
});
