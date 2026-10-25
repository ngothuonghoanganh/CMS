import { describe, expect, it } from 'vitest';
import {
  dataRequestStatusView,
  deadlineLines,
  logSentence,
  matchMarketing,
  requesterLine,
  requesterName,
} from './data-request-presentation';
import { dataRequest, dataRequestDetail, OWNER } from './test-fixtures';

const BEFORE_DEADLINES = Date.parse('2026-10-25T05:00:00.000Z');
const AFTER_RESPOND_BY = Date.parse('2026-10-28T01:00:00.000Z');
const AFTER_COMPLETE_BY = Date.parse('2026-11-21T01:00:00.000Z');

describe('the rows of "Yêu cầu từ người gửi form" (board 12)', () => {
  it('shows an open request as "Cần phản hồi" with both deadlines', () => {
    const request = dataRequest();
    expect(dataRequestStatusView(request, BEFORE_DEADLINES)).toEqual({
      text: 'Cần phản hồi',
      tone: 'warning',
      icon: 'clock',
    });
    expect(deadlineLines(request, BEFORE_DEADLINES)).toEqual([
      { text: 'Phản hồi trước 27/10', overdue: false },
      { text: 'Hoàn tất trước 20/11', overdue: false },
    ]);
  });

  it('warns when a deadline has passed', () => {
    const open = dataRequest();
    expect(dataRequestStatusView(open, AFTER_RESPOND_BY)).toMatchObject({
      text: 'Quá hạn phản hồi',
      tone: 'danger',
    });
    expect(deadlineLines(open, AFTER_RESPOND_BY)[0]).toEqual({
      text: 'Phản hồi trước 27/10',
      overdue: true,
    });
    const responded = dataRequest({ status: 'responded', respondedAt: '2026-10-26T02:00:00.000Z' });
    expect(dataRequestStatusView(responded, AFTER_RESPOND_BY)).toMatchObject({
      text: 'Đang xử lý',
      tone: 'info',
    });
    expect(deadlineLines(responded, AFTER_RESPOND_BY)).toEqual([
      { text: 'Hoàn tất trước 20/11', overdue: false },
    ]);
    expect(dataRequestStatusView(responded, AFTER_COMPLETE_BY)).toMatchObject({
      text: 'Quá hạn hoàn tất',
      tone: 'danger',
    });
  });

  it('shows when a request was completed, and no deadline any more', () => {
    const completed = { status: 'completed', completedAt: '2026-10-16T03:00:00.000Z' } as const;
    expect(
      dataRequestStatusView(dataRequest({ ...completed, type: 'withdraw_marketing' }), 0),
    ).toEqual({ text: 'Hoàn tất 16/10', tone: 'success', icon: 'check' });
    expect(dataRequestStatusView(dataRequest({ ...completed, type: 'access' }), 0).text).toBe(
      'Đã gửi bản sao 16/10',
    );
    expect(deadlineLines(dataRequest(completed), 0)).toEqual([]);
  });

  it('names the person and how to reach them, as on the board', () => {
    expect([requesterName(dataRequest()), requesterLine(dataRequest())]).toEqual([
      'Lê Mai Anh',
      '0987 106 223 · 1 lead',
    ]);
    const byEmail = dataRequest({
      contact: { name: null, phone: null, email: 'thaovy.h@gmail.com' },
      type: 'access',
    });
    expect([requesterName(byEmail), requesterLine(byEmail)]).toEqual([
      'thaovy.h@gmail.com',
      'qua email · 1 lead',
    ]);
    const named = dataRequest({
      contact: { name: 'Thảo Vy', phone: null, email: 'thaovy.h@gmail.com' },
    });
    expect(requesterLine(named)).toBe('thaovy.h@gmail.com · 1 lead');
    expect(requesterLine(dataRequest({ leads: { count: 999, capped: true } }))).toBe(
      '0987 106 223 · 999+ lead',
    );
  });

  it('shows a completed deletion masked, with how many leads it deleted', () => {
    const deleted = dataRequest({
      contact: { name: 'L. M. A.', phone: '0987 *** 223', email: null },
      masked: true,
      status: 'completed',
      completedAt: '2026-10-26T03:00:00.000Z',
      leads: null,
      completedCount: 2,
    });
    expect([requesterName(deleted), requesterLine(deleted)]).toEqual([
      'L. M. A.',
      '0987 *** 223 · đã xóa 2 lead',
    ]);
  });
});

describe('the log of a request', () => {
  it('writes each step', () => {
    const at = '2026-10-23T03:20:00.000Z';
    expect(logSentence({ at, actor: OWNER, action: 'created', count: null }, 'delete')).toBe(
      'Ghi nhận yêu cầu',
    );
    expect(logSentence({ at, actor: OWNER, action: 'responded', count: null }, 'delete')).toBe(
      'Đã phản hồi người yêu cầu',
    );
    expect(logSentence({ at, actor: OWNER, action: 'exported', count: 2 }, 'access')).toBe(
      'Xuất dữ liệu 2 lead',
    );
    const completed = { at, actor: OWNER, action: 'completed', count: 2 } as const;
    expect(logSentence(completed, 'delete')).toBe('Đã xóa 2 lead, hoàn tất');
    expect(logSentence(completed, 'withdraw_marketing')).toBe(
      'Đã rút đồng ý nhận ưu đãi ở 2 lead, hoàn tất',
    );
    expect(logSentence({ ...completed, count: null }, 'access')).toBe(
      'Đã gửi bản sao dữ liệu, hoàn tất',
    );
    expect(logSentence({ ...completed, count: null }, 'rectify')).toBe(
      'Đã sửa thông tin, hoàn tất',
    );
  });

  it('describes the marketing consent of each lead of the person', () => {
    const [match] = dataRequestDetail().matches;
    if (match === undefined) {
      throw new Error('The fixture has a match');
    }
    expect(matchMarketing(match)).toBe('Đang nhận ưu đãi');
    expect(matchMarketing({ ...match, marketingWithdrawnAt: '2026-10-26T03:00:00.000Z' })).toBe(
      'Đã rút ngày 26/10/2026',
    );
    expect(matchMarketing({ ...match, marketing: false })).toBe('Không chọn nhận ưu đãi');
  });
});
