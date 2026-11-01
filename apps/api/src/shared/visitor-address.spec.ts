import { describe, expect, it } from 'vitest';
import { withoutPort } from './visitor-address.js';

describe('withoutPort', () => {
  it.each([
    ['203.0.113.7:51234', '203.0.113.7'],
    ['203.0.113.7:0', '203.0.113.7'],
    ['[2001:db8::1]:51234', '2001:db8::1'],
    ['[2001:db8::1]', '2001:db8::1'],
    ['[::ffff:203.0.113.7]:443', '::ffff:203.0.113.7'],
  ])('takes the address out of %s', (forwarded, address) => {
    expect(withoutPort(forwarded)).toBe(address);
  });

  it.each(['203.0.113.7', '2001:db8::1', '::ffff:203.0.113.7', '2001:db8::1:51234'])(
    'keeps %s, an address with no port to take off, as it is',
    (address) => {
      expect(withoutPort(address)).toBe(address);
    },
  );

  it.each([
    'foo',
    '',
    '203.0.113.7:',
    '203.0.113.7:port',
    '203.0.113.7:123456',
    '203.0.113.7:80:80',
    '[2001:db8::1',
    '[2001:db8::1]:',
    '[2001:db8::1]:443:443',
    '[]:443',
  ])('leaves %j, which is not an address with a port, for the caller to refuse', (forwarded) => {
    expect(withoutPort(forwarded)).toBe(forwarded);
  });
});
