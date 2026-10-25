import { describe, expect, it } from 'vitest';
import { maskContact, maskEmail, maskName, maskPhone } from './mask-contact.js';

describe('masking a deleted person’s contact', () => {
  it('keeps the first and last groups of a Vietnamese number, as on board 12', () => {
    expect(maskPhone('+84987106223')).toBe('0987 *** 223');
    expect(maskPhone('+842838221234')).toBe('028 **** 1234');
  });

  it('keeps the ends of a number from another country', () => {
    expect(maskPhone('+12025550123')).toBe('+120*****123');
    expect(maskPhone('+6591234567')).toBe('+659****567');
  });

  it('keeps the initials of a name', () => {
    expect(maskName('Lê Mai  Anh')).toBe('L. M. A.');
    expect(maskName('Ước')).toBe('Ư.');
    // Typed with combining marks: the mark stays with its letter.
    expect(maskName('U\u031Bo\u031B\u0301c')).toBe('U\u031B.');
  });

  it('keeps the start of an email and its domain', () => {
    expect(maskEmail('thaovy.h@gmail.com')).toBe('th***@gmail.com');
    expect(maskEmail('an@smilecare.vn')).toBe('a***@smilecare.vn');
  });

  it('masks every field it has', () => {
    expect(maskContact({ name: 'Lê Mai Anh', phone: '+84987106223', email: null })).toEqual({
      name: 'L. M. A.',
      phone: '0987 *** 223',
      email: null,
    });
  });
});
