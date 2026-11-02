import { describe, expect, it } from 'vitest';
import { mailboxOf } from './mailbox.js';

describe('mailboxOf', () => {
  it('counts every variant of one mailbox as that mailbox', () => {
    expect(mailboxOf(' Thuy+moi1@SmileCare.vn ')).toBe('thuy@smilecare.vn');
    expect(mailboxOf('thuy.mkt+a@smilecare.vn')).toBe('thuy.mkt@smilecare.vn');
    expect(mailboxOf('T.h.u.y+x@googlemail.com')).toBe('thuy@gmail.com');
    expect(mailboxOf('an+1@gmail.com')).toBe(mailboxOf('a.n+2@gmail.com'));
  });
});
