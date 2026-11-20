/** The 6 digits of ADR-035: a year has room for 999 999 invoices. */
const MAX_SEQUENCE = 999_999;

/** `HD-{năm}-{số thứ tự 6 chữ số}`: the `sequence`th invoice of `year` in Vietnam. */
export function formatInvoiceNumber(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new RangeError(`An invoice year must have 4 digits, not ${year}`);
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MAX_SEQUENCE) {
    throw new RangeError(
      `Invoice ${sequence} of ${year} does not fit HD-{năm}-{6 chữ số} (ADR-035)`,
    );
  }
  return `HD-${year}-${String(sequence).padStart(6, '0')}`;
}

/** The counter of `invoice_counters` that numbers a year's invoices. */
export function invoiceCounterId(year: number): string {
  return `HD-${year}`;
}
