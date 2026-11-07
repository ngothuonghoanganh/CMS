import {
  type AutomationAction,
  type AutomationCondition,
  type AutomationDefinition,
  type AutomationOptions,
  type AutomationTrigger,
  opportunityStageLabels,
} from '@plp/contracts';
import { formatVnd } from '../../lib/format';
import { triggerLabel } from './automation-presentation';

/** A step of board 26: the trigger, a condition or an action, by its place. */
export type StepRef =
  { kind: 'trigger' } | { kind: 'condition'; index: number } | { kind: 'action'; index: number };

export type ConditionKind = AutomationCondition['kind'];
export type ActionKind = AutomationAction['kind'];

export const conditionKindLabels: Record<ConditionKind, string> = {
  source_contains: 'Nguồn chứa',
  page_in: 'Trang là',
  contact_has_tag: 'Khách có nhãn',
  opportunity_value_at_least: 'Giá trị cơ hội từ',
  stage_is: 'Giai đoạn là',
};

export const actionKindLabels: Record<ActionKind, string> = {
  assign: 'Giao người phụ trách',
  create_task: 'Tạo công việc',
  add_tag: 'Gắn nhãn',
  email: 'Gửi email nội bộ',
};

/** A new step as "Thêm điều kiện hoặc hành động" adds it: empty where a choice is needed. */
export function newCondition(kind: ConditionKind): AutomationCondition {
  switch (kind) {
    case 'source_contains':
      return { kind, field: 'source', text: '' };
    case 'page_in':
      return { kind, pageIds: [] };
    case 'contact_has_tag':
      return { kind, tag: '' };
    case 'opportunity_value_at_least':
      return { kind, value: 0 };
    case 'stage_is':
      return { kind, stages: [] };
  }
}

export function newAction(kind: ActionKind): AutomationAction {
  switch (kind) {
    case 'assign':
      return { kind, memberIds: [] };
    case 'create_task':
      return { kind, title: '', dueInMinutes: 15, assignee: 'owner' };
    case 'add_tag':
      return { kind, tag: '' };
    case 'email':
      return { kind, to: [], subject: '' };
  }
}

export function newTrigger(kind: AutomationTrigger['kind']): AutomationTrigger {
  switch (kind) {
    case 'lead_created':
      return { kind, pageIds: [] };
    case 'lead_still_new':
      return { kind, minutes: 15 };
    case 'opportunity_stage_changed':
      return { kind, stage: null };
    case 'task_overdue':
      return { kind };
  }
}

function names(ids: readonly string[], options: AutomationOptions): string {
  return ids
    .map((id) => options.members.find((person) => person.id === id)?.name ?? 'thành viên đã rời')
    .join(', ');
}

function pageNames(ids: readonly string[], options: AutomationOptions): string {
  return ids
    .map((id) => `“${options.pages.find((page) => page.id === id)?.title ?? 'trang đã xóa'}”`)
    .join(', ');
}

/** "Từ mọi trang có form của …" under the trigger. */
export function triggerSummary(
  trigger: AutomationTrigger,
  options: AutomationOptions,
  siteName: string,
): string {
  switch (trigger.kind) {
    case 'lead_created':
      return trigger.pageIds.length === 0
        ? `Từ mọi trang có form của ${siteName}`
        : `Từ ${pageNames(trigger.pageIds, options)}`;
    case 'lead_still_new':
      return 'Nhắc khi chưa ai đổi trạng thái của lead';
    case 'opportunity_stage_changed':
      return trigger.stage === null
        ? 'Vào bất kỳ giai đoạn nào'
        : 'Mỗi lần cơ hội vào giai đoạn này';
    case 'task_overdue':
      return 'Công việc tới hạn mà chưa xong';
  }
}

export function triggerTitle(trigger: AutomationTrigger): string {
  return triggerLabel(trigger);
}

export function conditionTitle(condition: AutomationCondition): string {
  return conditionKindLabels[condition.kind];
}

export function conditionSummary(
  condition: AutomationCondition,
  options: AutomationOptions,
): string {
  switch (condition.kind) {
    case 'source_contains':
      return condition.text === ''
        ? `utm_${condition.field} chứa …`
        : `utm_${condition.field} chứa “${condition.text}”`;
    case 'page_in':
      return condition.pageIds.length === 0
        ? 'Chưa chọn trang'
        : pageNames(condition.pageIds, options);
    case 'contact_has_tag':
      return condition.tag === '' ? 'Chưa chọn nhãn' : `“${condition.tag}”`;
    case 'opportunity_value_at_least':
      return formatVnd(condition.value);
    case 'stage_is':
      return condition.stages.length === 0
        ? 'Chưa chọn giai đoạn'
        : condition.stages.map((stage) => opportunityStageLabels[stage]).join(', ');
  }
}

export function actionTitle(action: AutomationAction): string {
  return actionKindLabels[action.kind];
}

export function actionSummary(action: AutomationAction, options: AutomationOptions): string {
  switch (action.kind) {
    case 'assign':
      if (action.memberIds.length === 0) {
        return 'Chưa chọn thành viên';
      }
      return action.memberIds.length === 1
        ? names(action.memberIds, options)
        : `Xoay vòng: ${names(action.memberIds, options)}`;
    case 'create_task': {
      const who =
        action.assignee === 'owner' ? 'người phụ trách' : names([action.assignee], options);
      return action.title === '' ? 'Chưa nhập việc cần làm' : `“${action.title}” cho ${who}`;
    }
    case 'add_tag':
      return action.tag === '' ? 'Chưa nhập nhãn' : `“${action.tag}”`;
    case 'email': {
      const to =
        action.to === 'owner'
          ? 'người phụ trách'
          : action.to.length === 0
            ? null
            : names(action.to, options);
      return (
        [to === null ? null : `Tới ${to}`, action.subject === '' ? null : `“${action.subject}”`]
          .filter(Boolean)
          .join(' · ') || 'Chưa có người nhận và tiêu đề'
      );
    }
  }
}

/** Why a step cannot run yet, as board 26 says it under the step; null when it can. */
export function conditionProblem(condition: AutomationCondition): string | null {
  switch (condition.kind) {
    case 'source_contains':
      return condition.text === '' ? 'Chưa nhập chuỗi cần tìm' : null;
    case 'page_in':
      return condition.pageIds.length === 0 ? 'Chưa chọn trang' : null;
    case 'contact_has_tag':
      return condition.tag === '' ? 'Chưa chọn nhãn' : null;
    case 'opportunity_value_at_least':
      return null;
    case 'stage_is':
      return condition.stages.length === 0 ? 'Chưa chọn giai đoạn' : null;
  }
}

export function actionProblem(action: AutomationAction): string | null {
  switch (action.kind) {
    case 'assign':
      return action.memberIds.length === 0 ? 'Chưa chọn thành viên' : null;
    case 'create_task':
      return action.title === '' ? 'Chưa nhập việc cần làm' : null;
    case 'add_tag':
      return action.tag === '' ? 'Chưa nhập nhãn' : null;
    case 'email':
      if (action.to !== 'owner' && action.to.length === 0) {
        return 'Chưa chọn người nhận';
      }
      return action.subject === '' ? 'Chưa nhập tiêu đề' : null;
  }
}

/** "N bước thiếu cấu hình", as the API counts it: an automation with no action misses one. */
export function missingCount(definition: AutomationDefinition): number {
  return (
    (definition.actions.length === 0 ? 1 : 0) +
    definition.actions.filter((action) => actionProblem(action) !== null).length +
    definition.conditions.filter((condition) => conditionProblem(condition) !== null).length
  );
}
