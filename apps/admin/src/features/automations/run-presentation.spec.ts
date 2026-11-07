import { describe, expect, it } from 'vitest';
import { automationRunsBadge, runWhen, stepFailure } from './run-presentation';

// 10:50 on 5 November 2026 in Vietnam.
const NOW = Date.parse('2026-11-05T03:50:00.000Z');
const HOOK = 'https://crm.smilecare.vn/api/leads';

describe('board 27 presentation', () => {
  it('says when a run started as the board does', () => {
    expect(runWhen('2026-11-05T03:02:00.000Z', NOW)).toBe('10:02 hôm nay');
    expect(runWhen('2026-11-04T14:30:00.000Z', NOW)).toBe('Hôm qua 21:30');
    expect(runWhen('2026-10-30T14:05:00.000Z', NOW)).toBe('30/10 21:05');
  });

  it('names the automation’s state with its recent errors', () => {
    expect(automationRunsBadge({ state: 'on', pausedReason: null }, 3)).toEqual({
      label: 'Đang bật · có lỗi gần đây',
      tone: 'success',
    });
    expect(automationRunsBadge({ state: 'paused', pausedReason: 'errors' }, 0).label).toBe(
      'Tạm dừng do lỗi',
    );
  });

  it('tells a server error from a refusal and a blocked address', () => {
    const step = {
      action: { kind: 'webhook' as const, url: HOOK, secretId: 's1' },
      status: 'failed' as const,
      attempts: 3,
      at: null,
      summary: null,
    };
    expect(
      stepFailure({ ...step, error: { code: 'webhook_http_error', httpStatus: 500 } }),
    ).toEqual({
      line: `POST ${HOOK} → 500 (3 lần)`,
      fix: expect.stringMatching(/^Lỗi nằm ở máy chủ nhận/) as unknown,
    });
    expect(
      stepFailure({ ...step, attempts: 1, error: { code: 'webhook_http_error', httpStatus: 400 } })
        .fix,
    ).toMatch(/^Máy chủ nhận từ chối/);
    expect(
      stepFailure({
        ...step,
        attempts: 1,
        error: { code: 'webhook_blocked_address', httpStatus: null },
      }),
    ).toEqual({ line: `POST ${HOOK}`, fix: expect.stringMatching(/mạng nội bộ/) as unknown });
  });
});
