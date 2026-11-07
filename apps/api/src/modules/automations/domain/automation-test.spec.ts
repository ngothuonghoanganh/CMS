import { describe, expect, it } from 'vitest';
import { type TestNames, type TestSubject, testDefinition } from './automation-test.js';

const HA = '64b0000000000000000000e1';
const PHUONG = '64b0000000000000000000e2';
const PAGE = '64b0000000000000000000a1';
// 09:58 in Vietnam.
const NOW = new Date('2026-11-05T02:58:00.000Z');

const SUBJECT: TestSubject = {
  lead: { name: 'Phạm Mỹ Duyên', at: NOW, pageId: PAGE },
  contactName: 'Phạm Mỹ Duyên',
  ownerId: null,
  facts: {
    source: { source: 'facebook', medium: 'cpc', campaign: null },
    pageId: PAGE,
    tags: [],
    opportunityValue: null,
    stage: 'new',
  },
};

const NAMES: TestNames = {
  members: new Map([
    [HA, 'Thu Hà'],
    [PHUONG, 'Lan Phương'],
  ]),
  pages: new Map([[PAGE, 'Ưu đãi niềng răng']]),
  rotation: 0,
};

describe('automation test run (board 26)', () => {
  it('says what each step would do, the owner given by a step serving the next ones', () => {
    const result = testDefinition(
      {
        trigger: { kind: 'lead_created', pageIds: [] },
        conditions: [{ kind: 'source_contains', field: 'source', text: 'facebook' }],
        actions: [
          { kind: 'assign', memberIds: [HA, PHUONG] },
          { kind: 'create_task', title: 'Gọi lại', dueInMinutes: 15, assignee: 'owner' },
          { kind: 'email', to: [], subject: 'Lead mới: «Tên khách»' },
          { kind: 'email', to: 'owner', subject: 'Lead mới: «Tên khách» từ «Trang nguồn»' },
        ],
      },
      SUBJECT,
      NAMES,
      NOW,
    );
    expect(result.lead).toEqual({ name: 'Phạm Mỹ Duyên', at: NOW.toISOString() });
    expect(result.trigger).toEqual({ outcome: 'pass', text: 'Khớp: lead lúc 09:58' });
    expect(result.conditions).toEqual([
      { outcome: 'pass', text: 'Đạt: utm_source chứa “facebook”' },
    ]);
    expect(result.actions).toEqual([
      { outcome: 'pass', text: 'Sẽ giao cho Thu Hà' },
      { outcome: 'pass', text: 'Sẽ tạo, hạn 10:13' },
      { outcome: 'skip', text: 'Bỏ qua: thiếu người nhận' },
      {
        outcome: 'pass',
        text: 'Sẽ gửi cho 1 người: “Lead mới: Phạm Mỹ Duyên từ Ưu đãi niềng răng”',
      },
    ]);
  });

  it('stops at a condition that fails, and at a page the trigger leaves out', () => {
    const failed = testDefinition(
      {
        trigger: { kind: 'lead_created', pageIds: [] },
        conditions: [
          { kind: 'contact_has_tag', tag: 'VIP' },
          { kind: 'source_contains', field: 'source', text: 'facebook' },
        ],
        actions: [{ kind: 'add_tag', tag: 'Mới' }],
      },
      SUBJECT,
      NAMES,
      NOW,
    );
    expect(failed.conditions.map((step) => step.outcome)).toEqual(['fail', 'not_reached']);
    expect(failed.actions).toEqual([{ outcome: 'not_reached', text: 'Không chạy' }]);
    const elsewhere = testDefinition(
      { trigger: { kind: 'lead_created', pageIds: [HA] }, conditions: [], actions: [] },
      SUBJECT,
      NAMES,
      NOW,
    );
    expect(elsewhere.trigger.outcome).toBe('fail');
  });

  it('skips a task for nobody, and names a member who left', () => {
    const result = testDefinition(
      {
        trigger: { kind: 'task_overdue' },
        conditions: [],
        actions: [
          { kind: 'create_task', title: 'Gọi', dueInMinutes: 0, assignee: 'owner' },
          { kind: 'assign', memberIds: ['64b0000000000000000000ff'] },
        ],
      },
      { ...SUBJECT, lead: null },
      NAMES,
      NOW,
    );
    expect(result.actions.map((step) => step.text)).toEqual([
      'Bỏ qua: khách chưa có người phụ trách',
      'Bỏ qua: thành viên không còn xem được khách hàng của site',
    ]);
  });
});
