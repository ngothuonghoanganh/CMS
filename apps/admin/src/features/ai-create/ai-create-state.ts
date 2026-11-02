import {
  type AiLanguage,
  type AiPageJobRequest,
  aiPageJobRequestSchema,
  type AiTone,
  MAX_SECTIONS,
  type PageGoal,
  type SectionType,
  slugify,
} from '@plp/contracts';
import {
  canMoveSection,
  getSectionDefinition,
  goalOutline,
  insertionIndex,
} from '@plp/sections/schema';
import { finalizeSlug, normalizeSlugTyping, SLUG_MAX } from '../seo/seo-presentation';

/** "Tạo trang bằng AI" (board 20, ADR-031): brief, structure, then the job. Pure, unit-tested. */

export type AiStep = 'brief' | 'structure' | 'writing';

export const aiSteps: ReadonlyArray<{ step: AiStep; label: string }> = [
  { step: 'brief', label: 'Brief' },
  { step: 'structure', label: 'Cấu trúc' },
  { step: 'writing', label: 'Viết nội dung' },
];

export type BriefField =
  'product' | 'audience' | 'differentiators' | 'existingContent' | 'title' | 'slug';
export type BriefErrors = Partial<Record<BriefField, string>>;

/** A section of the proposed structure; `key` stays with it while it moves. */
export interface StructureEntry {
  key: string;
  type: SectionType;
  variant: string;
  /** What the section does on this page: the goal's label, or the section's name when added. */
  name: string;
}

export interface AiCreateState {
  step: AiStep;
  goal: PageGoal;
  product: string;
  audience: string;
  differentiators: string;
  tone: AiTone;
  language: AiLanguage;
  existingContent: string;
  title: string;
  /** The title follows the product until the user edits it. */
  titleEdited: boolean;
  slug: string;
  /** The slug follows the title until the user edits it. */
  slugEdited: boolean;
  structure: StructureEntry[];
  /** For keys of added sections. */
  nextKey: number;
  errors: BriefErrors;
}

export type AiCreateAction =
  | {
      type: 'brief_changed';
      field: 'product' | 'audience' | 'differentiators' | 'existingContent';
      value: string;
    }
  | { type: 'goal_selected'; goal: PageGoal }
  | { type: 'tone_selected'; tone: AiTone }
  | { type: 'language_selected'; language: AiLanguage }
  | { type: 'title_changed'; title: string }
  | { type: 'slug_changed'; slug: string }
  | { type: 'slug_finished' }
  | { type: 'structure_proposed' }
  | { type: 'section_moved'; key: string; offset: -1 | 1 }
  | { type: 'section_removed'; key: string }
  | { type: 'section_added'; sectionType: SectionType }
  | { type: 'step_changed'; step: AiStep }
  | { type: 'errors_shown'; errors: BriefErrors };

const TITLE_MAX = 120;

/** The page title a product suggests: its first 120 characters. */
function titleOf(product: string): string {
  return product.trim().slice(0, TITLE_MAX).trim();
}

export function initialAiCreateState(goal: PageGoal = 'lead'): AiCreateState {
  return {
    step: 'brief',
    goal,
    product: '',
    audience: '',
    differentiators: '',
    tone: 'friendly',
    language: 'vi',
    existingContent: '',
    title: '',
    titleEdited: false,
    slug: '',
    slugEdited: false,
    structure: [],
    nextKey: 0,
    errors: {},
  };
}

function withoutError(errors: BriefErrors, ...fields: BriefField[]): BriefErrors {
  return Object.fromEntries(
    Object.entries(errors).filter(([field]) => !fields.some((removed) => removed === field)),
  );
}

function withTitle(state: AiCreateState, title: string, edited: boolean): AiCreateState {
  return {
    ...state,
    title,
    titleEdited: edited,
    slug: state.slugEdited ? state.slug : slugify(title, SLUG_MAX),
    errors: withoutError(state.errors, 'title', ...(state.slugEdited ? [] : ['slug' as const])),
  };
}

/** The goal's outline, each section named for what it does on the page (board 20). */
export function proposedStructure(goal: PageGoal): StructureEntry[] {
  return goalOutline(goal).map((item, index) => ({
    key: `goal-${index}`,
    type: item.type,
    variant: item.variant,
    name: item.label,
  }));
}

/** The line under a section's name: what the section is for, not text written for the brief. */
export function descriptionOf(entry: Pick<StructureEntry, 'type'>): string {
  return getSectionDefinition(entry.type).description;
}

/** Whether a section may go one place up or down: the navigation bar and footer stay put. */
export function canShift(
  structure: readonly StructureEntry[],
  index: number,
  offset: -1 | 1,
): boolean {
  return canMoveSection(structure, index, index + offset);
}

/** Why a section type cannot be added now, or null: a second singleton, or a full page. */
export function addBlockedReason(
  structure: readonly StructureEntry[],
  type: SectionType,
): string | null {
  if (getSectionDefinition(type).singleton && structure.some((entry) => entry.type === type)) {
    return 'Đã có trên trang';
  }
  return structure.length >= MAX_SECTIONS ? `Một trang có tối đa ${MAX_SECTIONS} section` : null;
}

export function aiCreateReducer(state: AiCreateState, action: AiCreateAction): AiCreateState {
  switch (action.type) {
    case 'brief_changed': {
      const next = {
        ...state,
        [action.field]: action.value,
        errors: withoutError(state.errors, action.field),
      };
      return action.field === 'product' && !state.titleEdited
        ? withTitle(next, titleOf(action.value), false)
        : next;
    }
    case 'goal_selected':
      return { ...state, goal: action.goal };
    case 'tone_selected':
      return { ...state, tone: action.tone };
    case 'language_selected':
      return { ...state, language: action.language };
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
    case 'structure_proposed':
      return { ...state, structure: proposedStructure(state.goal), step: 'structure' };
    case 'section_moved': {
      const index = state.structure.findIndex((entry) => entry.key === action.key);
      if (index === -1 || !canShift(state.structure, index, action.offset)) {
        return state;
      }
      const structure = [...state.structure];
      const [moving] = structure.splice(index, 1);
      if (moving === undefined) {
        return state;
      }
      structure.splice(index + action.offset, 0, moving);
      return { ...state, structure };
    }
    case 'section_removed':
      return state.structure.length <= 1
        ? state
        : { ...state, structure: state.structure.filter((entry) => entry.key !== action.key) };
    case 'section_added': {
      if (addBlockedReason(state.structure, action.sectionType) !== null) {
        return state;
      }
      const definition = getSectionDefinition(action.sectionType);
      const entry: StructureEntry = {
        key: `added-${state.nextKey}`,
        type: action.sectionType,
        variant: definition.defaultVariant,
        name: definition.label,
      };
      const structure = [...state.structure];
      // Before the footer, after the navigation bar; those two keep their place.
      structure.splice(insertionIndex(structure, action.sectionType, structure.length), 0, entry);
      return { ...state, structure, nextKey: state.nextKey + 1 };
    }
    case 'step_changed':
      return { ...state, step: action.step };
    case 'errors_shown':
      return { ...state, errors: action.errors };
  }
}

const briefFields: readonly BriefField[] = [
  'title',
  'slug',
  'product',
  'audience',
  'differentiators',
  'existingContent',
];

/** Fields in the order the form shows them, to focus the first problem. */
export const briefFieldOrder: readonly BriefField[] = [
  'product',
  'audience',
  'differentiators',
  'existingContent',
  'title',
  'slug',
];

function fieldOfPath(path: ReadonlyArray<PropertyKey>): BriefField | undefined {
  const [first, second] = path;
  const key = first === 'brief' ? second : first;
  return briefFields.find((field) => field === key);
}

/** Field messages of a request's issues (from the contract, or a server problem). */
export function briefErrorsOf(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>,
): BriefErrors {
  const errors: BriefErrors = {};
  for (const issue of issues) {
    const field = fieldOfPath(issue.path);
    if (field !== undefined) {
      errors[field] ??= issue.message;
    }
  }
  return errors;
}

/** The job request of the screen, validated with the contract schema. */
export function buildAiJobRequest(
  state: AiCreateState,
): { ok: true; request: AiPageJobRequest } | { ok: false; errors: BriefErrors } {
  const request: AiPageJobRequest = {
    title: state.title,
    slug: finalizeSlug(state.slug),
    brief: {
      product: state.product,
      audience: state.audience,
      goal: state.goal,
      differentiators: state.differentiators,
      tone: state.tone,
      language: state.language,
      existingContent: state.existingContent,
    },
    // The brief step checks the brief alone; the structure comes next.
    structure:
      state.structure.length > 0
        ? state.structure.map(({ type, variant }) => ({ type, variant }))
        : proposedStructure(state.goal).map(({ type, variant }) => ({ type, variant })),
  };
  const parsed = aiPageJobRequestSchema.safeParse(request);
  if (parsed.success) {
    return { ok: true, request };
  }
  return { ok: false, errors: briefErrorsOf(parsed.error.issues) };
}
