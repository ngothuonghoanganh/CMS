import { invoiceNumberSchema } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { formatInvoiceNumber, invoiceCounterId } from './invoice-number.js';

describe('formatInvoiceNumber', () => {
  it('is HD-{năm}-{6 chữ số}', () => {
    expect(formatInvoiceNumber(2026, 1)).toBe('HD-2026-000001');
    expect(formatInvoiceNumber(2026, 1101)).toBe('HD-2026-001101');
    expect(formatInvoiceNumber(2027, 999_999)).toBe('HD-2027-999999');
    expect(invoiceNumberSchema.safeParse(formatInvoiceNumber(2026, 42)).success).toBe(true);
  });

  it('refuses what the format cannot hold', () => {
    expect(() => formatInvoiceNumber(2026, 0)).toThrow(RangeError);
    expect(() => formatInvoiceNumber(2026, 1_000_000)).toThrow('does not fit');
    expect(() => formatInvoiceNumber(2026, 1.5)).toThrow(RangeError);
    expect(() => formatInvoiceNumber(26, 1)).toThrow('4 digits');
  });

  it('counts each year apart', () => {
    expect(invoiceCounterId(2026)).toBe('HD-2026');
    expect(invoiceCounterId(2027)).not.toBe(invoiceCounterId(2026));
  });
});
