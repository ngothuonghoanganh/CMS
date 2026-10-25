import { describe, expect, it } from 'vitest';
import {
  csvField,
  csvRecord,
  LEAD_CSV_HEADER,
  leadCsvFields,
  PERSON_CSV_HEADER,
  personCsvFields,
} from './lead-csv.js';

const lead = {
  createdAt: new Date('2026-10-24T09:42:07.000Z'),
  fields: {
    name: 'Nguyễn Thu Hà',
    phone: '+84901234567',
    email: 'thuha@example.com',
    message: 'Gọi sau 18h, "gấp"',
  },
  source: { source: 'facebook', medium: 'cpc', campaign: 'uu-dai-t11' },
  device: 'mobile' as const,
  status: 'scheduled' as const,
  note: '',
  consent: {
    marketing: true,
    at: new Date('2026-10-24T09:42:07.000Z'),
    marketingWithdrawnAt: null,
  },
};

describe('csvField', () => {
  it.each(['=1+1', '+84901234567', '-5', '@SUM(A1)', '\tx', '\rx'])(
    'keeps the formula-like %j as text with a leading apostrophe',
    (value) => {
      expect(csvField(value).replace(/^"|"$/g, '').startsWith(`'`)).toBe(true);
    },
  );

  it('quotes commas, quotes and line breaks, doubling quotes', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('line 1\nline 2')).toBe('"line 1\nline 2"');
    expect(csvField('=1+1,2')).toBe(`"'=1+1,2"`);
  });

  it('leaves plain text alone', () => {
    expect(csvField('Nguyễn Thu Hà')).toBe('Nguyễn Thu Hà');
    expect(csvField('')).toBe('');
  });
});

describe('csvRecord', () => {
  it('joins fields with commas and ends with CRLF', () => {
    expect(csvRecord(['a', 'b,c', '=x'])).toBe(`a,"b,c",'=x\r\n`);
  });
});

describe('leadCsvFields', () => {
  it('writes one lead in the order of the header, in Vietnamese and Vietnam time', () => {
    const fields = leadCsvFields(lead, 'Ưu đãi niềng răng');
    expect(fields).toHaveLength(LEAD_CSV_HEADER.length);
    expect(fields).toEqual([
      '2026-10-24 16:42:07',
      'Nguyễn Thu Hà',
      '0901 234 567',
      'thuha@example.com',
      'Gọi sau 18h, "gấp"',
      'Ưu đãi niềng răng',
      'facebook / cpc',
      'uu-dai-t11',
      'Điện thoại',
      'Hẹn lịch',
      '',
      'Có',
    ]);
  });

  it('writes direct visits, missing fields and a withdrawn marketing consent', () => {
    const fields = leadCsvFields(
      {
        ...lead,
        fields: { ...lead.fields, email: null, message: null },
        source: { source: '(direct)', medium: '(none)', campaign: null },
        consent: { ...lead.consent, marketingWithdrawnAt: new Date() },
      },
      'Trang chủ',
    );
    expect(fields.slice(3, 5)).toEqual(['', '']);
    expect(fields.slice(6, 8)).toEqual(['trực tiếp', '']);
    expect(fields.at(-1)).toBe('Đã rút');
    expect(
      leadCsvFields({ ...lead, consent: { ...lead.consent, marketing: false } }, 'x').at(-1),
    ).toBe('Không');
  });

  it('adds the consent evidence for a person export', () => {
    const fields = personCsvFields(lead, 'Ưu đãi niềng răng', {
      version: 2,
      requiredText: 'Tôi đồng ý để Nha khoa Smile Care liên hệ.',
    });
    expect(fields).toHaveLength(PERSON_CSV_HEADER.length);
    expect(fields.slice(-3)).toEqual([
      '2026-10-24 16:42:07',
      '2',
      'Tôi đồng ý để Nha khoa Smile Care liên hệ.',
    ]);
  });
});
