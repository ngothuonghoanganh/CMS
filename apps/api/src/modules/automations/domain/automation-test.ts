import {
  type AutomationAction,
  type AutomationCondition,
  type AutomationDefinition,
  type AutomationTrigger,
  opportunityStageLabels,
  type OpportunityStage,
  type TestAutomationResponse,
  type TestStepResult,
  vnDateTimeOf,
} from '@plp/contracts';
import { conditionHolds, renderSubject, type RunFacts } from './automation-rules.js';

/** What "Chạy thử" reads: the latest lead of the site with its profile, or a sample. */
export interface TestSubject {
  /** The real lead; null for "Lead mẫu (không có dữ liệu thật)". */
  lead: { name: string; at: Date; pageId: string | null } | null;
  contactName: string;
  ownerId: string | null;
  facts: RunFacts;
}

/** Names the result uses: members a step may name, pages, and the next turn of a rotation. */
export interface TestNames {
  members: ReadonlyMap<string, string>;
  pages: ReadonlyMap<string, string>;
  rotation: number;
}

function time(at: Date): string {
  return vnDateTimeOf(at).slice(11, 16);
}

function money(value: number): string {
  return `${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} ₫`;
}

function stages(list: readonly OpportunityStage[]): string {
  return list.map((stage) => opportunityStageLabels[stage]).join(', ');
}

/** "utm_source chứa “facebook”" and the like, for a condition's result. */
export function describeCondition(condition: AutomationCondition, names: TestNames): string {
  switch (condition.kind) {
    case 'source_contains':
      return `utm_${condition.field} chứa “${condition.text}”`;
    case 'page_in':
      return `trang là ${condition.pageIds.map((id) => `“${names.pages.get(id) ?? 'trang đã xóa'}”`).join(', ')}`;
    case 'contact_has_tag':
      return `khách có nhãn “${condition.tag}”`;
    case 'opportunity_value_at_least':
      return `giá trị cơ hội từ ${money(condition.value)}`;
    case 'stage_is':
      return `giai đoạn là ${stages(condition.stages)}`;
  }
}

function testTrigger(trigger: AutomationTrigger, subject: TestSubject): TestStepResult {
  switch (trigger.kind) {
    case 'lead_created': {
      const pageId = subject.lead?.pageId ?? null;
      if (trigger.pageIds.length > 0 && (pageId === null || !trigger.pageIds.includes(pageId))) {
        return { outcome: 'fail', text: 'Không khớp: lead này đến từ trang khác' };
      }
      return {
        outcome: 'pass',
        text: subject.lead === null ? 'Khớp: lead mẫu' : `Khớp: lead lúc ${time(subject.lead.at)}`,
      };
    }
    case 'lead_still_new':
      return {
        outcome: 'pass',
        text: `Chạy ${trigger.minutes} phút sau lead nếu lead còn “Mới”`,
      };
    case 'opportunity_stage_changed':
      return {
        outcome: 'pass',
        text:
          trigger.stage === null
            ? 'Chạy mỗi khi cơ hội đổi giai đoạn'
            : `Chạy khi cơ hội chuyển sang ${opportunityStageLabels[trigger.stage]}`,
      };
    case 'task_overdue':
      return { outcome: 'pass', text: 'Chạy khi một công việc tới hạn mà chưa xong' };
  }
}

/**
 * "Chạy thử" (ADR-034): what each step would do with the subject, without doing it. No member is
 * given anything, no email goes out, no run is counted.
 */
export function testDefinition(
  definition: AutomationDefinition,
  subject: TestSubject,
  names: TestNames,
  now: Date,
): TestAutomationResponse {
  const trigger = testTrigger(definition.trigger, subject);
  let stopped = trigger.outcome === 'fail';
  const notReached: TestStepResult = { outcome: 'not_reached', text: 'Không chạy' };
  const conditions = definition.conditions.map((condition): TestStepResult => {
    if (stopped) {
      return notReached;
    }
    const described = describeCondition(condition, names);
    if (conditionHolds(condition, subject.facts)) {
      return { outcome: 'pass', text: `Đạt: ${described}` };
    }
    stopped = true;
    return { outcome: 'fail', text: `Không đạt: ${described}` };
  });
  let ownerId = subject.ownerId;
  const actions = definition.actions.map((action): TestStepResult => {
    if (stopped) {
      return notReached;
    }
    const result = testAction(action, subject, names, ownerId, now);
    if (action.kind === 'assign' && result.outcome === 'pass') {
      ownerId = result.assigned;
    }
    return { outcome: result.outcome, text: result.text };
  });
  return {
    lead:
      subject.lead === null ? null : { name: subject.lead.name, at: subject.lead.at.toISOString() },
    trigger,
    conditions,
    actions,
  };
}

function testAction(
  action: AutomationAction,
  subject: TestSubject,
  names: TestNames,
  ownerId: string | null,
  now: Date,
): TestStepResult & { assigned: string | null } {
  const skip = (text: string) => ({
    outcome: 'skip' as const,
    text: `Bỏ qua: ${text}`,
    assigned: null,
  });
  switch (action.kind) {
    case 'assign': {
      if (action.memberIds.length === 0) {
        return skip('chưa chọn thành viên');
      }
      const memberId = action.memberIds[names.rotation % action.memberIds.length] ?? '';
      const name = names.members.get(memberId);
      return name === undefined
        ? skip('thành viên không còn xem được khách hàng của site')
        : { outcome: 'pass', text: `Sẽ giao cho ${name}`, assigned: memberId };
    }
    case 'create_task': {
      if (action.title === '') {
        return skip('chưa nhập việc cần làm');
      }
      const assignee = action.assignee === 'owner' ? ownerId : action.assignee;
      if (assignee === null) {
        return skip('khách chưa có người phụ trách');
      }
      if (!names.members.has(assignee)) {
        return skip('người được giao không còn xem được khách hàng của site');
      }
      const due = new Date(now.getTime() + action.dueInMinutes * 60_000);
      return { outcome: 'pass', text: `Sẽ tạo, hạn ${time(due)}`, assigned: null };
    }
    case 'add_tag':
      return action.tag === ''
        ? skip('chưa nhập nhãn')
        : { outcome: 'pass', text: `Sẽ gắn nhãn “${action.tag}”`, assigned: null };
    case 'email': {
      const recipients =
        action.to === 'owner'
          ? ownerId === null
            ? []
            : [ownerId]
          : action.to.filter((id) => names.members.has(id));
      if (recipients.length === 0) {
        return skip('thiếu người nhận');
      }
      if (action.subject === '') {
        return skip('chưa nhập tiêu đề');
      }
      const pageId = subject.lead?.pageId ?? null;
      const title = renderSubject(action.subject, {
        contactName: subject.contactName,
        pageTitle: pageId === null ? null : (names.pages.get(pageId) ?? null),
        ownerName: ownerId === null ? null : (names.members.get(ownerId) ?? null),
        profileUrl: '(link hồ sơ)',
      });
      return {
        outcome: 'pass',
        text: `Sẽ gửi cho ${recipients.length} người: “${title}”`,
        assigned: null,
      };
    }
  }
}
