import { describe, expect, it } from 'vitest';
import { cardText, cycleText, periodText, vnDateText, vndText } from './billing-text.js';

describe('how the emails of the plan write (ADR-035, T3)', () => {
  it('writes amounts and days as the admin does', () => {
    expect(vndText(599_000)).toBe('599.000 ₫');
    expect(vndText(14_900_000)).toBe('14.900.000 ₫');
    expect(vndText(0)).toBe('0 ₫');
    // 23:30 on 30/11 in UTC is already 01/12 in Vietnam.
    expect(vnDateText(new Date('2026-11-30T23:30:00.000Z'))).toBe('01/12/2026');
    expect(
      periodText(new Date('2026-11-01T03:00:00.000Z'), new Date('2026-12-01T03:00:00.000Z')),
    ).toBe('01/11/2026 – 01/12/2026');
    expect(cycleText('yearly')).toBe('năm');
  });

  it('names a card by its network and last four digits only', () => {
    expect(cardText({ brand: 'visa', last4: '4242' })).toBe('Visa •••• 4242');
    expect(cardText({ brand: 'amex', last4: '0005' })).toBe('American Express •••• 0005');
    expect(cardText({ brand: 'napas', last4: '1234' })).toBe('Napas •••• 1234');
  });
});
