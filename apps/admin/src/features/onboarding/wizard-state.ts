import {
  type CreatePageRequest,
  createPageRequestSchema,
  type PageGoal,
  type PageStyle,
  slugify,
} from '@plp/contracts';
import { goalDefinitions } from '@plp/sections/schema';
import { finalizeSlug, normalizeSlugTyping, SLUG_MAX } from '../seo/seo-presentation';

/** "Tạo trang mới" (board 02): goal, main content, style. Pure state, unit-tested. */

export type WizardStep = 1 | 2 | 3;

export const wizardSteps: ReadonlyArray<{ step: WizardStep; label: string }> = [
  { step: 1, label: 'Mục tiêu' },
  { step: 2, label: 'Nội dung chính' },
  { step: 3, label: 'Phong cách' },
];

export type ContentField = 'title' | 'slug' | 'offer' | 'audience' | 'phone';
export type ContentErrors = Partial<Record<ContentField, string>>;

export interface WizardState {
  step: WizardStep;
  goal: PageGoal;
  title: string;
  /** The title follows the goal until the user edits it. */
  titleEdited: boolean;
  slug: string;
  /** The slug follows the title until the user edits it. */
  slugEdited: boolean;
  offer: string;
  audience: string;
  phone: string;
  style: PageStyle;
  errors: ContentErrors;
}

export type WizardAction =
  | { type: 'goal_selected'; goal: PageGoal }
  | { type: 'title_changed'; title: string }
  | { type: 'slug_changed'; slug: string }
  | { type: 'slug_finished' }
  | { type: 'brief_changed'; field: 'offer' | 'audience' | 'phone'; value: string }
  | { type: 'style_selected'; style: PageStyle }
  | { type: 'step_changed'; step: WizardStep }
  | { type: 'errors_shown'; errors: ContentErrors; step?: WizardStep };

/** The suggested slug of a page title: "Thu lead tư vấn" → "thu-lead-tu-van". */
export function suggestSlug(title: string): string {
  return slugify(title, SLUG_MAX);
}

export function initialWizardState(goal: PageGoal = 'lead'): WizardState {
  const title = goalDefinitions[goal].title;
  return {
    step: 1,
    goal,
    title,
    titleEdited: false,
    slug: suggestSlug(title),
    slugEdited: false,
    offer: '',
    audience: '',
    phone: '',
    style: 'calm',
    errors: {},
  };
}

const contentFields: readonly ContentField[] = ['title', 'slug', 'offer', 'audience', 'phone'];

function withoutError(errors: ContentErrors, field: ContentField): ContentErrors {
  if (errors[field] === undefined) {
    return errors;
  }
  const next: ContentErrors = {};
  for (const key of contentFields) {
    const message = errors[key];
    if (key !== field && message !== undefined) {
      next[key] = message;
    }
  }
  return next;
}

function withTitle(state: WizardState, title: string, edited: boolean): WizardState {
  return {
    ...state,
    title,
    titleEdited: edited,
    slug: state.slugEdited ? state.slug : suggestSlug(title),
    errors: withoutError(
      state.slugEdited ? state.errors : withoutError(state.errors, 'slug'),
      'title',
    ),
  };
}

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'goal_selected': {
      const next = { ...state, goal: action.goal };
      return state.titleEdited ? next : withTitle(next, goalDefinitions[action.goal].title, false);
    }
    case 'title_changed':
      return withTitle(state, action.title, true);
    case 'slug_changed':
      return {
        ...state,
        slug: normalizeSlugTyping(action.slug),
        slugEdited: true,
        errors: withoutError(state.errors, 'slug'),
      };
    case 'slug_finished':
      return { ...state, slug: finalizeSlug(state.slug) };
    case 'brief_changed':
      return {
        ...state,
        [action.field]: action.value,
        errors: withoutError(state.errors, action.field),
      };
    case 'style_selected':
      return { ...state, style: action.style };
    case 'step_changed':
      return { ...state, step: action.step };
    case 'errors_shown':
      return { ...state, errors: action.errors, step: action.step ?? state.step };
  }
}

function fieldOfPath(path: ReadonlyArray<PropertyKey>): ContentField | undefined {
  const [first, second] = path;
  const key = first === 'start' && second === 'brief' ? path[2] : first;
  return contentFields.find((field) => field === key);
}

/** The create request of the wizard, validated with the contract schema. */
export function buildCreatePageRequest(
  state: WizardState,
): { ok: true; request: CreatePageRequest } | { ok: false; errors: ContentErrors } {
  const request: CreatePageRequest = {
    title: state.title,
    slug: finalizeSlug(state.slug),
    start: {
      kind: 'goal',
      goal: state.goal,
      brief: { offer: state.offer, audience: state.audience, phone: state.phone },
      style: state.style,
    },
  };
  const parsed = createPageRequestSchema.safeParse(request);
  if (parsed.success) {
    return { ok: true, request: parsed.data };
  }
  const errors: ContentErrors = {};
  for (const issue of parsed.error.issues) {
    const field = fieldOfPath(issue.path);
    if (field !== undefined) {
      errors[field] ??= issue.message;
    }
  }
  return { ok: false, errors };
}

/** Field errors of a server problem (`issues` paths of the create request). */
export function contentErrorsOf(fieldErrors: Readonly<Record<string, string>>): ContentErrors {
  const errors: ContentErrors = {};
  for (const [path, message] of Object.entries(fieldErrors)) {
    const field = fieldOfPath(path.split('.'));
    if (field !== undefined) {
      errors[field] ??= message;
    }
  }
  return errors;
}

/** Fields in the order they appear, to focus the first problem. */
export const contentFieldOrder = contentFields;
