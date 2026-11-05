import { describe, expect, it } from 'vitest';
import {
  defaultDue,
  displayPhone,
  fromLocalInput,
  meetingMoment,
  profileInitials,
  taskDueLine,
  timelineView,
  toLocalInput,
  zaloHref,
} from './profile-presentation';

// 16:50 on Sunday 1 November 2026 in Vietnam.
const NOW = Date.parse('2026-11-01T09:50:00.000Z');
const HA = { id: '64b0000000000000000000e1', name: 'Thu Hà' };

describe('profile presentation (board 23)', () => {
  it('names and reaches the person as the board does', () => {
    expect(profileInitials('Nguyễn Thu Trang')).toBe('TT');
    expect(profileInitials('Hà')).toBe('H');
    expect(displayPhone('+84912345678')).toBe('0912 345 678');
    expect(displayPhone('+12025550123')).toBe('+12025550123');
    expect(zaloHref('+84912345678')).toBe('https://zalo.me/0912345678');
  });

  it('reads and writes datetime-local values in Vietnam’s time', () => {
    expect(toLocalInput(NOW)).toBe('2026-11-01T16:50');
    expect(fromLocalInput('2026-11-01T16:50')).toBe('2026-11-01T09:50:00.000Z');
    expect(fromLocalInput('')).toBeNull();
    expect(new Date(defaultDue(NOW)).toISOString()).toBe('2026-11-01T11:00:00.000Z');
  });

  it('says when a task is due, and how late it is once overdue', () => {
    const task = { id: 't', title: 'Gọi', assignee: HA, doneAt: null };
    expect(taskDueLine({ ...task, dueAt: '2026-11-01T09:25:00.000Z' }, NOW)).toBe(
      'Quá hạn 25 phút · Thu Hà',
    );
    expect(taskDueLine({ ...task, dueAt: '2026-10-30T09:50:00.000Z' }, NOW)).toBe(
      'Quá hạn 2 ngày · Thu Hà',
    );
    expect(taskDueLine({ ...task, dueAt: '2026-11-01T12:00:00.000Z' }, NOW)).toBe(
      'Hôm nay 19:00 · Thu Hà',
    );
    expect(taskDueLine({ ...task, dueAt: '2026-11-02T03:00:00.000Z' }, NOW)).toBe(
      'Mai 10:00 · Thu Hà',
    );
    expect(taskDueLine({ ...task, dueAt: '2026-11-05T03:00:00.000Z', assignee: null }, NOW)).toBe(
      '05/11 10:00',
    );
  });

  it('reads timeline entries with their weekday, source and how a lead joined', () => {
    expect(meetingMoment('2026-11-01T02:30:00.000Z')).toBe('CN 01/11 · 09:30');
    expect(
      timelineView({
        kind: 'lead',
        id: 'l',
        at: '2026-10-30T14:05:00.000Z',
        page: { id: 'p', title: null },
        message: 'Trả góp 12 tháng?',
        source: 'tiktok',
        medium: 'video',
        campaign: null,
        consentVersion: null,
        joined: true,
      }),
    ).toEqual({
      tone: 'lead',
      title: 'Lead mới từ “Trang đã xóa”',
      when: '30/10 · 21:05',
      body: 'Hỏi: Trả góp 12 tháng? · tiktok / video · tự gom vào hồ sơ vì trùng số điện thoại',
    });
    expect(
      timelineView({
        kind: 'meeting',
        id: 'm',
        at: '2026-10-31T09:18:00.000Z',
        actor: HA,
        meeting: { at: '2026-11-01T02:30:00.000Z', place: 'Quận 3', with: '', note: '' },
      }),
    ).toMatchObject({
      title: 'Đặt lịch hẹn CN 01/11 · 09:30',
      when: '31/10 · 16:18 · Thu Hà',
      body: 'Quận 3',
    });
  });
});
