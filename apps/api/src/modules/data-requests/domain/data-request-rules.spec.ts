import { describe, expect, it } from 'vitest';
import { stepProblem } from './data-request-rules.js';

describe('stepProblem', () => {
  it('answers an open request once', () => {
    expect(stepProblem('respond', { type: 'delete', status: 'open' })).toBeNull();
    expect(stepProblem('respond', { type: 'delete', status: 'responded' })).toBe(
      'Yêu cầu này đã được phản hồi',
    );
  });

  it('exports the file of a request to see the stored data only', () => {
    expect(stepProblem('export', { type: 'access', status: 'responded' })).toBeNull();
    expect(stepProblem('export', { type: 'rectify', status: 'open' })).toBe(
      'Chỉ yêu cầu xem dữ liệu mới có file xuất',
    );
  });

  it('completes an open or answered request, and nothing after that', () => {
    expect(stepProblem('complete', { type: 'rectify', status: 'open' })).toBeNull();
    expect(stepProblem('complete', { type: 'withdraw_marketing', status: 'responded' })).toBeNull();
    for (const step of ['respond', 'export', 'complete'] as const) {
      expect(stepProblem(step, { type: 'access', status: 'completed' })).toBe(
        'Yêu cầu này đã hoàn tất',
      );
    }
  });
});
