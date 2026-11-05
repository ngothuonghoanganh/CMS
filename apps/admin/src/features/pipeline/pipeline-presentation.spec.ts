import type { Opportunity } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { formatVnd, movesFrom, nextLine, parseVnd } from './pipeline-presentation';

// 16:50 on 1 November 2026 in Vietnam.
const NOW = Date.parse('2026-11-01T09:50:00.000Z');

function card(overrides: Partial<Opportunity>): Opportunity {
  return {
    id: 'a',
    title: 'Implant',
    stage: 'contacted',
    value: null,
    valueBy: null,
    won: null,
    lost: null,
    owner: null,
    contact: { id: 'c', name: 'Nam' },
    next: null,
    stageChangedAt: '2026-10-31T00:00:00.000Z',
    createdAt: '2026-10-30T00:00:00.000Z',
    ...overrides,
  };
}

describe('pipeline presentation (board 24)', () => {
  it('writes and reads amounts in đồng', () => {
    expect(formatVnd(412_000_000)).toBe('412.000.000 ₫');
    expect(formatVnd(0)).toBe('0 ₫');
    expect(parseVnd('36.500.000 ₫')).toBe(36_500_000);
    expect(parseVnd('')).toBeNull();
  });

  it('says what is next on a card, late in its own words, and how a closed one ended', () => {
    expect(nextLine(card({}), NOW)).toBe('Chưa có việc tiếp theo');
    expect(
      nextLine(card({ next: { title: 'Gửi báo giá', dueAt: '2026-10-31T09:50:00.000Z' } }), NOW),
    ).toBe('Gửi báo giá · quá hạn 1 ngày');
    expect(
      nextLine(card({ next: { title: 'Gọi lại', dueAt: '2026-11-02T03:00:00.000Z' } }), NOW),
    ).toBe('Gọi lại · Mai 10:00');
    expect(nextLine(card({ stage: 'won', won: { value: 1, on: '2026-10-29' } }), NOW)).toBe(
      'Thắng 29/10',
    );
    expect(nextLine(card({ stage: 'lost', lost: { reason: 'no_need', note: '' } }), NOW)).toBe(
      'Thua · Chưa có nhu cầu',
    );
  });

  it('moves an open card anywhere else, a closed one only by reopening', () => {
    expect(movesFrom('new')).toEqual(['contacted', 'scheduled', 'visited', 'won', 'lost']);
    expect(movesFrom('won')).toEqual([]);
  });
});
