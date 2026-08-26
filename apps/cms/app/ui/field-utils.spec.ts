import { describe, expect, it } from 'vitest';

import {
  clampNumber,
  datetimeLocalFromIso,
  formatCssDimension,
  formatCssSpacing,
  isoFromDatetimeLocal,
  normalizeHexColor,
  parseCssDimension,
  parseCssSpacing,
} from './field-utils';

describe('field utilities', () => {
  it('parses and formats the supported CSS dimension vocabulary', () => {
    expect(parseCssDimension('24px')).toMatchObject({ value: 24, unit: 'px' });
    expect(parseCssDimension('100%')).toMatchObject({ value: 100, unit: '%' });
    expect(parseCssDimension('auto')).toMatchObject({ value: undefined, unit: 'auto' });
    expect(parseCssDimension('calc(100% - 1rem)').unsupported).toBe('calc(100% - 1rem)');
    expect(formatCssDimension(1.5, 'rem')).toBe('1.5rem');
  });

  it('keeps four-sided spacing explicit when the user edits it', () => {
    expect(parseCssSpacing('16px 24px')).toEqual({
      top: '16px',
      right: '24px',
      bottom: '16px',
      left: '24px',
    });
    expect(
      formatCssSpacing({ top: '8px', right: '12px', bottom: '16px', left: '20px' }),
    ).toBe('8px 12px 16px 20px');
  });

  it('normalizes bounded numeric, color, and date-time values', () => {
    expect(clampNumber(120, 0, 100)).toBe(100);
    expect(normalizeHexColor('#8cf0c5')).toBe('#8CF0C5');
    expect(normalizeHexColor('transparent')).toBeUndefined();
    const localDate = datetimeLocalFromIso('2030-01-01T00:00:00.000Z');
    expect(localDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(isoFromDatetimeLocal(localDate)).toBe('2030-01-01T00:00:00.000Z');
    expect(isoFromDatetimeLocal('not a date')).toBeUndefined();
  });
});
