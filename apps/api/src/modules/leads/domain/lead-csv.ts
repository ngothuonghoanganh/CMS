import {
  formatLeadPhone,
  leadDeviceLabels,
  leadSourceLabel,
  leadStatusLabels,
  vnDateTimeOf,
} from '@plp/contracts';
import type { LeadRecord } from '../lead.schema.js';

/** Excel opens a UTF-8 file with Vietnamese text correctly only after the byte order mark. */
export const CSV_BOM = '﻿';

/** Excel and Sheets run a cell starting with one of these as a formula (CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * One CSV field (ADR-018): a leading apostrophe keeps a formula-like value as text, and quotes
 * wrap a value with a comma, a quote or a line break.
 */
export function csvField(value: string): string {
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** One CSV record, ended by CRLF as RFC 4180 and Excel expect. */
export function csvRecord(fields: readonly string[]): string {
  return `${fields.map(csvField).join(',')}\r\n`;
}

/** The parts of a lead a CSV row shows. */
export type CsvLead = Pick<
  LeadRecord,
  'createdAt' | 'fields' | 'source' | 'device' | 'status' | 'note' | 'consent'
>;

export const LEAD_CSV_HEADER = [
  'Thời gian',
  'Họ và tên',
  'Số điện thoại',
  'Email',
  'Lời nhắn',
  'Trang',
  'Nguồn',
  'Chiến dịch',
  'Thiết bị',
  'Trạng thái',
  'Ghi chú',
  'Nhận ưu đãi',
] as const;

function marketingLabel(consent: CsvLead['consent']): string {
  if (!consent.marketing) {
    return 'Không';
  }
  return consent.marketingWithdrawnAt === null ? 'Có' : 'Đã rút';
}

/** The fields of `LEAD_CSV_HEADER` for one lead; times are in Vietnam. */
export function leadCsvFields(lead: CsvLead, pageTitle: string): string[] {
  return [
    vnDateTimeOf(lead.createdAt),
    lead.fields.name,
    formatLeadPhone(lead.fields.phone),
    lead.fields.email ?? '',
    lead.fields.message ?? '',
    pageTitle,
    leadSourceLabel(lead.source),
    lead.source.campaign ?? '',
    leadDeviceLabels[lead.device],
    leadStatusLabels[lead.status],
    lead.note,
    marketingLabel(lead.consent),
  ];
}

/** A person's export (ADR-017) adds the consent evidence of each lead. */
export const PERSON_CSV_HEADER = [
  ...LEAD_CSV_HEADER,
  'Lúc đồng ý',
  'Bản nội dung đồng ý',
  'Nội dung đồng ý',
] as const;

export function personCsvFields(
  lead: CsvLead,
  pageTitle: string,
  consent: { version: number; requiredText: string },
): string[] {
  return [
    ...leadCsvFields(lead, pageTitle),
    vnDateTimeOf(lead.consent.at),
    String(consent.version),
    consent.requiredText,
  ];
}
