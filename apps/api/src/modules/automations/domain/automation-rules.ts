import {
  AUTOMATION_ROTATION_MAX,
  type AutomationAction,
  type AutomationCondition,
  type AutomationDefinition,
  type AutomationRecipe,
  automationRecipeLabels,
  foldVietnamese,
  type OpportunityStage,
} from '@plp/contracts';

/** A failed step is tried again after 5, 15 and 40 minutes, within the hour (ADR-034). */
export const RETRY_DELAYS_MINUTES = [5, 15, 40] as const;
/** The attempts of a step: the first and its three retries. */
export const STEP_ATTEMPTS_MAX = RETRY_DELAYS_MINUTES.length + 1;

/**
 * When a step that failed `attempts` times is tried again; null once it used its retries, and the
 * run fails then.
 */
export function retryAt(attempts: number, now: Date): Date | null {
  const minutes = RETRY_DELAYS_MINUTES[attempts - 1];
  return minutes === undefined ? null : new Date(now.getTime() + minutes * 60_000);
}

/** Members a recipe uses: who may be given leads, and the managers who hear of a win. */
export interface RecipeMembers {
  assignees: readonly string[];
  managers: readonly string[];
}

/**
 * "Bắt đầu từ mẫu" (board 25): a draft with every step filled in from the site's members, so it
 * can be enabled at once and changed later (A2).
 */
export function recipeDefinition(
  recipe: AutomationRecipe,
  members: RecipeMembers,
): { name: string; definition: AutomationDefinition } {
  const name = automationRecipeLabels[recipe].name;
  switch (recipe) {
    case 'assign_new_leads':
      return {
        name,
        definition: {
          trigger: { kind: 'lead_created', pageIds: [] },
          conditions: [],
          actions: [
            { kind: 'assign', memberIds: members.assignees.slice(0, AUTOMATION_ROTATION_MAX) },
            {
              kind: 'create_task',
              title: 'Gọi lại trong 15 phút',
              dueInMinutes: 15,
              assignee: 'owner',
            },
          ],
        },
      };
    case 'remind_uncalled':
      return {
        name,
        definition: {
          trigger: { kind: 'lead_still_new', minutes: 15 },
          conditions: [],
          actions: [
            {
              kind: 'email',
              to: 'owner',
              subject: '«Tên khách» chưa được gọi sau 15 phút',
            },
            ...(members.managers.length === 0
              ? []
              : [
                  {
                    kind: 'email' as const,
                    to: members.managers.slice(0, 5),
                    subject: '«Tên khách» chưa được gọi sau 15 phút',
                  },
                ]),
          ],
        },
      };
    case 'notify_won':
      return {
        name,
        definition: {
          trigger: { kind: 'opportunity_stage_changed', stage: 'won' },
          conditions: [],
          actions: [
            {
              kind: 'email',
              to: members.managers.slice(0, 5),
              subject: 'Đã chốt được «Tên khách» từ «Trang nguồn»',
            },
          ],
        },
      };
  }
}

function actionMissing(action: AutomationAction): boolean {
  switch (action.kind) {
    case 'assign':
      return action.memberIds.length === 0;
    case 'create_task':
      return action.title === '';
    case 'add_tag':
      return action.tag === '';
    case 'email':
      return action.subject === '' || (action.to !== 'owner' && action.to.length === 0);
  }
}

function conditionMissing(condition: AutomationCondition): boolean {
  switch (condition.kind) {
    case 'source_contains':
      return condition.text === '';
    case 'page_in':
      return condition.pageIds.length === 0;
    case 'contact_has_tag':
      return condition.tag === '';
    case 'opportunity_value_at_least':
      return false;
    case 'stage_is':
      return condition.stages.length === 0;
  }
}

/** "N bước thiếu cấu hình": an automation with any cannot be enabled (ADR-034). */
export function missingSteps(definition: AutomationDefinition): number {
  return (
    (definition.actions.length === 0 ? 1 : 0) +
    definition.actions.filter(actionMissing).length +
    definition.conditions.filter(conditionMissing).length
  );
}

/** What the conditions look at, read when the run starts. */
export interface RunFacts {
  source: { source: string; medium: string; campaign: string | null } | null;
  pageId: string | null;
  tags: readonly string[];
  opportunityValue: number | null;
  stage: OpportunityStage | null;
}

export function conditionHolds(condition: AutomationCondition, facts: RunFacts): boolean {
  switch (condition.kind) {
    case 'source_contains': {
      const value = facts.source?.[condition.field] ?? null;
      return value !== null && foldVietnamese(value).includes(foldVietnamese(condition.text));
    }
    case 'page_in':
      return facts.pageId !== null && condition.pageIds.includes(facts.pageId);
    case 'contact_has_tag':
      return facts.tags.includes(condition.tag);
    case 'opportunity_value_at_least':
      return facts.opportunityValue !== null && facts.opportunityValue >= condition.value;
    case 'stage_is':
      return facts.stage !== null && condition.stages.includes(facts.stage);
  }
}

/** "Nếu": every condition must hold. */
export function conditionsHold(
  conditions: readonly AutomationCondition[],
  facts: RunFacts,
): boolean {
  return conditions.every((condition) => conditionHolds(condition, facts));
}

/** The values the subject of an internal email may hold. */
export interface SubjectValues {
  contactName: string;
  pageTitle: string | null;
  ownerName: string | null;
  profileUrl: string;
}

/** Fills «Tên khách», «Trang nguồn», «Người phụ trách» and «Link hồ sơ» into a subject. */
export function renderSubject(subject: string, values: SubjectValues): string {
  return subject
    .replaceAll('«Tên khách»', values.contactName)
    .replaceAll('«Trang nguồn»', values.pageTitle ?? 'trang đã xóa')
    .replaceAll('«Người phụ trách»', values.ownerName ?? 'chưa giao')
    .replaceAll('«Link hồ sơ»', values.profileUrl);
}
