import { describe, expect, it } from 'vitest';
import { formatDateTime } from './date-format';

describe('formatDateTime', () => {
  it('formats as dd/MM/yyyy HH:mm in Vietnam time (UTC+7)', () => {
    expect(formatDateTime('2026-10-31T08:00:00.000Z')).toBe('31/10/2026 15:00');
  });

  it('pads and rolls over the date across midnight', () => {
    expect(formatDateTime('2026-01-04T17:05:00Z')).toBe('05/01/2026 00:05');
  });

  it('throws on an invalid date instead of printing garbage', () => {
    expect(() => formatDateTime('not a date')).toThrow();
  });
});
