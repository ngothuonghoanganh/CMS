export type BuilderPanelSide = 'left' | 'right';

export const BUILDER_PANEL_STORAGE_KEYS = {
  left: 'payload-builder-left-panel-width',
  right: 'payload-builder-right-panel-width',
} as const;

export const BUILDER_PANEL_DEFAULT_WIDTHS = {
  left: 300,
  right: 340,
} as const;

export const BUILDER_PANEL_LIMITS = {
  left: { min: 220, max: 480 },
  right: { min: 280, max: 640 },
} as const;

export const BUILDER_MIN_CANVAS_WIDTH = 420;

const WORKSPACE_CHROME_WIDTH = 134;

export type BuilderPanelWidths = Record<BuilderPanelSide, number>;

export function panelWidthBounds(
  side: BuilderPanelSide,
  viewportWidth: number,
  otherPanelWidth?: number,
): { min: number; max: number } {
  const limits = BUILDER_PANEL_LIMITS[side];
  const defaultOtherPanelWidth: number =
    BUILDER_PANEL_DEFAULT_WIDTHS[side === 'left' ? 'right' : 'left'];
  const resolvedOtherPanelWidth = otherPanelWidth ?? defaultOtherPanelWidth;
  const ratioLimit = Math.floor(viewportWidth * (side === 'left' ? 0.4 : 0.5));
  const available = Math.floor(
    viewportWidth -
      WORKSPACE_CHROME_WIDTH -
      BUILDER_MIN_CANVAS_WIDTH -
      resolvedOtherPanelWidth,
  );
  return {
    min: limits.min,
    max: Math.max(limits.min, Math.min(limits.max, ratioLimit, available)),
  };
}

export function clampPanelWidth(
  side: BuilderPanelSide,
  width: number,
  viewportWidth = 1440,
  otherPanelWidth?: number,
): number {
  const bounds = panelWidthBounds(side, viewportWidth, otherPanelWidth);
  return Math.round(Math.min(bounds.max, Math.max(bounds.min, width)));
}

export function normalizePanelWidths(
  widths: Partial<BuilderPanelWidths>,
  viewportWidth = 1440,
): BuilderPanelWidths {
  let left = clampPanelWidth(
    'left',
    widths.left ?? BUILDER_PANEL_DEFAULT_WIDTHS.left,
    viewportWidth,
    BUILDER_PANEL_LIMITS.right.min,
  );
  let right = clampPanelWidth(
    'right',
    widths.right ?? BUILDER_PANEL_DEFAULT_WIDTHS.right,
    viewportWidth,
    left,
  );
  left = clampPanelWidth('left', left, viewportWidth, right);
  return { left, right };
}

export function readPanelWidths(
  storage: Storage | null | undefined,
  viewportWidth = 1440,
): BuilderPanelWidths {
  const values: Partial<BuilderPanelWidths> = {};
  for (const side of ['left', 'right'] as const) {
    try {
      const raw = storage?.getItem(BUILDER_PANEL_STORAGE_KEYS[side]);
      const value = raw === null || raw === undefined ? Number.NaN : Number(raw);
      if (Number.isFinite(value)) values[side] = value;
    } catch {
      // Private browsing and embedded documents can deny storage access.
    }
  }
  return normalizePanelWidths(values, viewportWidth);
}

export function persistPanelWidths(
  storage: Storage | null | undefined,
  widths: BuilderPanelWidths,
): void {
  try {
    for (const side of ['left', 'right'] as const) {
      storage?.setItem(BUILDER_PANEL_STORAGE_KEYS[side], String(widths[side]));
    }
  } catch {
    // A resize remains usable when persistence is unavailable.
  }
}
