import { describe, expect, it } from 'vitest';
import { foldVietnamese, leadSearchKeys, parseLeadQuery } from './lead-search.js';

describe('foldVietnamese', () => {
  it('drops accents, đ and case, and collapses spaces', () => {
    expect(foldVietnamese('  Nguyễn  Thu Hà ')).toBe('nguyen thu ha');
    expect(foldVietnamese('ĐẶNG Minh Đức')).toBe('dang minh duc');
    expect(foldVietnamese('Võ Ngọc Trâm')).toBe('vo ngoc tram');
  });
});

describe('leadSearchKeys', () => {
  it('stores the digits of the number, the email and the folded name', () => {
    expect(
      leadSearchKeys({ name: 'Nguyễn Thu Hà', phone: '+84901234567', email: 'thuha@example.com' }),
    ).toEqual({ phone: '84901234567', email: 'thuha@example.com', name: 'nguyen thu ha' });
    expect(leadSearchKeys({ name: 'Bảo', phone: '+16505550100', email: null })).toEqual({
      phone: '16505550100',
      email: null,
      name: 'bao',
    });
  });
});

describe('parseLeadQuery', () => {
  it.each([
    ['0901 234', ['84901234']],
    ['0901.234.567', ['84901234567']],
    ['+84 901', ['84901']],
    ['84901', ['84901']],
    ['0084 901', ['84901']],
    ['+1 650', ['1650']],
    ['901 234', ['901234', '84901234']],
  ])('reads %j as the start of a phone number %j', (q, prefixes) => {
    expect(parseLeadQuery(q)).toEqual({ kind: 'phone', prefixes });
  });

  it('reads anything with @ as the start of an email, lowercased', () => {
    expect(parseLeadQuery(' ThuHa@Ex ')).toEqual({ kind: 'email', prefix: 'thuha@ex' });
  });

  it('reads the rest as part of a name, accents ignored', () => {
    expect(parseLeadQuery('Thu Hà')).toEqual({ kind: 'name', text: 'thu ha' });
    expect(parseLeadQuery('Hà 0901')).toEqual({ kind: 'name', text: 'ha 0901' });
  });

  it('has nothing to search for in blanks or punctuation alone', () => {
    expect(parseLeadQuery('   ')).toBeNull();
    expect(parseLeadQuery('+')).toEqual({ kind: 'name', text: '+' });
  });
});
