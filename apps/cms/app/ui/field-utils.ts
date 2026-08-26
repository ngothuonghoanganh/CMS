export const CSS_DIMENSION_UNITS = ['px', '%', 'rem', 'em', 'vh', 'vw'] as const;

export type CssDimensionUnit = (typeof CSS_DIMENSION_UNITS)[number];
export type UnitSelection = CssDimensionUnit | 'auto';

export type ParsedCssDimension = {
  value: number | undefined;
  unit: UnitSelection;
  unsupported: string | undefined;
};

const dimensionPattern = /^(-?(?:\d+|\d*\.\d+))(px|%|rem|em|vh|vw)?$/i;

export function clampNumber(value: number, min?: number, max?: number): number {
  if (min !== undefined && value < min) return min;
  if (max !== undefined && value > max) return max;
  return value;
}

export function parseCssDimension(value: string | undefined): ParsedCssDimension {
  const normalized = value?.trim() ?? '';
  if (normalized === '') return { value: undefined, unit: 'px', unsupported: undefined };
  if (normalized === 'auto')
    return { value: undefined, unit: 'auto', unsupported: undefined };

  const match = normalized.match(dimensionPattern);
  if (!match) return { value: undefined, unit: 'px', unsupported: normalized };

  const number = Number(match[1]);
  if (!Number.isFinite(number))
    return { value: undefined, unit: 'px', unsupported: normalized };
  const unit = (match[2]?.toLowerCase() ?? 'px') as CssDimensionUnit;
  return { value: number, unit, unsupported: undefined };
}

export function formatCssDimension(
  value: number | undefined,
  unit: UnitSelection,
): string {
  if (unit === 'auto') return 'auto';
  if (value === undefined || !Number.isFinite(value)) return '';
  return `${value}${unit}`;
}

export type SpacingSides = {
  top: string;
  right: string;
  bottom: string;
  left: string;
};

const emptySpacing: SpacingSides = { top: '', right: '', bottom: '', left: '' };

export function parseCssSpacing(value: string | undefined): SpacingSides {
  const values = (value?.trim() ?? '').split(/\s+/).filter(Boolean);
  if (values.length === 0 || values.length > 4) return emptySpacing;

  const [first = '', second = first, third = first, fourth = second] = values;
  if (values.length === 1) {
    return { top: first, right: first, bottom: first, left: first };
  }
  if (values.length === 2) {
    return { top: first, right: second, bottom: first, left: second };
  }
  if (values.length === 3) {
    return { top: first, right: second, bottom: third, left: second };
  }
  return { top: first, right: second, bottom: third, left: fourth };
}

export function formatCssSpacing(sides: SpacingSides): string {
  const values = [sides.top, sides.right, sides.bottom, sides.left] as const;
  if (values.every((value) => value === '')) return '';
  const top = sides.top || '0px';
  const right = sides.right || '0px';
  const bottom = sides.bottom || '0px';
  const left = sides.left || '0px';
  if (top === right && top === bottom && top === left) return top;
  if (top === bottom && right === left) return `${top} ${right}`;
  if (right === left) return `${top} ${right} ${bottom}`;
  return `${top} ${right} ${bottom} ${left}`;
}

export function isLinkedSpacing(sides: SpacingSides): boolean {
  return (
    sides.top === sides.right && sides.top === sides.bottom && sides.top === sides.left
  );
}

export function normalizeHexColor(value: string | undefined): string | undefined {
  const normalized = value?.trim() ?? '';
  if (!/^#[0-9a-f]{6}$/i.test(normalized)) return undefined;
  return normalized.toUpperCase();
}

export function datetimeLocalFromIso(value: string | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => part.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function isoFromDatetimeLocal(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
