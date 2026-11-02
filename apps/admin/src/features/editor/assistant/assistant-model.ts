import {
  AI_SEO_TARGET,
  type AiAssistAction,
  type AiFailure,
  type AiScopeSection,
  type AiScopeSeo,
  type AiSuggestionChange,
  type AiSuggestionRequest,
  type AiSuggestionResult,
  type AiSuggestionScope,
  type AiTone,
  type SectionInstance,
} from '@plp/contracts';
import {
  aiActionPaths,
  aiWritablePaths,
  getAtPath,
  getSectionDefinition,
  listLabelsOf,
  splitPath,
} from '@plp/sections/schema';
import { resolvePath } from '../content-fields';
import type { AiDraftChange, DraftSnapshot } from '../store';

/**
 * The editor's side of the AI assistant (ADR-031, board 21), pure and unit-tested: what the scope
 * holds and sends, which actions it allows, what changed in it while the AI wrote, and what an
 * accepted suggestion writes.
 */

/** The chips of board 21, in its order; the free request is `custom`. */
export const assistChips: readonly AiAssistAction[] = [
  'rewrite',
  'shorten',
  'change_tone',
  'suggest_heading',
  'suggest_cta',
  'write_section',
  'suggest_seo',
];

/** The text field last focused on the canvas or in the properties panel ("Đoạn chữ"). */
export interface FocusedText {
  sectionId: string;
  path: string;
}

/** What one request asks: the scope, the action, and the tone or the user's words. */
export interface AssistAsk {
  scope: AiSuggestionScope;
  action: AiAssistAction;
  tone?: AiTone | undefined;
  instruction: string;
}

/**
 * The scope's text when a request was sent: what goes to the API, and what a conflict compares
 * the editor's draft with when the answer comes back.
 */
export interface ScopeText {
  sections: AiScopeSection[];
  seo: AiScopeSeo | null;
}

/** A section's text the AI may write, by content path. */
export function sectionTextOf(section: SectionInstance): AiScopeSection {
  return {
    id: section.id,
    type: section.type,
    variant: section.variant,
    texts: Object.fromEntries(
      aiWritablePaths(section).map((path) => {
        const value = getAtPath(section.content, path);
        return [path, typeof value === 'string' ? value : ''];
      }),
    ),
  };
}

/**
 * The text a request carries, from the draft the editor holds (unsaved changes included): the
 * section of a field or section scope whole, since the API rebuilds it with the registry, every
 * section of the page, and the SEO texts for "Gợi ý SEO".
 */
export function scopeTextOf(
  draft: DraftSnapshot,
  ask: Pick<AssistAsk, 'scope' | 'action'>,
): ScopeText {
  const { scope } = ask;
  const sections = draft.composition.sections.filter(
    (section) => scope.kind === 'page' || section.id === scope.sectionId,
  );
  return {
    sections: sections.map(sectionTextOf),
    seo:
      ask.action === 'suggest_seo'
        ? { title: draft.seo.title, description: draft.seo.description }
        : null,
  };
}

export function suggestionRequestOf(ask: AssistAsk, text: ScopeText): AiSuggestionRequest {
  return {
    scope: ask.scope,
    action: ask.action,
    ...(ask.tone === undefined ? {} : { tone: ask.tone }),
    instruction: ask.instruction,
    sections: text.sections,
    ...(text.seo === null ? {} : { seo: text.seo }),
  };
}

/** A key of one text of the draft: "{sectionId}:{path}", or "seo:title". */
export function textKey(sectionId: string, path: string): string {
  return `${sectionId}:${path}`;
}

/** The layout of a section: a new variant may hide or show fields. */
const VARIANT = '@variant';

/** The texts a conflict compares: the field of a "Đoạn chữ" scope, else all of the scope. */
function comparedTexts(text: ScopeText, scope: AiSuggestionScope): Map<string, string> {
  const texts = new Map<string, string>();
  for (const section of text.sections) {
    if (scope.kind === 'field') {
      if (section.id === scope.sectionId) {
        texts.set(textKey(section.id, scope.path), section.texts[scope.path] ?? '');
      }
      continue;
    }
    texts.set(textKey(section.id, VARIANT), section.variant);
    for (const [path, value] of Object.entries(section.texts)) {
      texts.set(textKey(section.id, path), value);
    }
  }
  if (text.seo !== null) {
    texts.set(textKey(AI_SEO_TARGET, 'title'), text.seo.title);
    texts.set(textKey(AI_SEO_TARGET, 'description'), text.seo.description);
  }
  return texts;
}

/** What changed in the scope while the AI wrote: the texts, by section and path. */
export interface ScopeConflict {
  changed: { sectionId: string; path: string }[];
}

/**
 * The texts of the scope that differ between when the request was sent and now: edited, added
 * (a new list item), gone (a section removed) or laid out anew. Null when nothing changed.
 */
export function conflictOf(
  sent: ScopeText,
  now: ScopeText,
  scope: AiSuggestionScope,
): ScopeConflict | null {
  const before = comparedTexts(sent, scope);
  const after = comparedTexts(now, scope);
  const keys = [...new Set([...before.keys(), ...after.keys()])];
  const changed = keys
    .filter((key) => before.get(key) !== after.get(key))
    .map((key) => {
      const separator = key.indexOf(':');
      return { sectionId: key.slice(0, separator), path: key.slice(separator + 1) };
    });
  return changed.length === 0 ? null : { changed };
}

/* Labels. */

function sectionOf(
  sections: readonly SectionInstance[],
  sectionId: string,
): SectionInstance | undefined {
  return sections.find((section) => section.id === sectionId);
}

/**
 * The name of a text in the panel's words: "Tiêu đề", "Nút chính", "Câu hỏi 2 · Trả lời", "Tiêu
 * đề SEO"; a section's layout is "Bố cục".
 */
export function fieldLabelOf(
  sections: readonly SectionInstance[],
  sectionId: string,
  path: string,
): string {
  if (sectionId === AI_SEO_TARGET) {
    return path === 'title' ? 'Tiêu đề SEO' : 'Mô tả SEO';
  }
  if (path === VARIANT) {
    return 'Bố cục';
  }
  const section = sectionOf(sections, sectionId);
  const target = section ? resolvePath(section.type, path) : null;
  if (!section || target?.kind !== 'leaf') {
    return path;
  }
  const [listKey, index] = splitPath(path);
  const list = getSectionDefinition(section.type).fields.find((field) => field.key === listKey);
  if (list?.kind === 'list' && typeof index === 'number') {
    const { itemLabel } = listLabelsOf(section.type, section.variant, list);
    return `${itemLabel} ${index + 1} · ${target.field.label}`;
  }
  return target.field.label;
}

/** The section's name on the canvas, or "Section" once it is gone. */
export function sectionLabelOf(sections: readonly SectionInstance[], sectionId: string): string {
  const section = sectionOf(sections, sectionId);
  return section ? getSectionDefinition(section.type).label : 'Section';
}

/** What the scope is called in sentences: "Hero", "“Tiêu đề” của Hero", "trang". */
export function scopeTitleOf(
  sections: readonly SectionInstance[],
  scope: AiSuggestionScope,
): string {
  switch (scope.kind) {
    case 'page':
      return 'trang';
    case 'section':
      return sectionLabelOf(sections, scope.sectionId);
    case 'field':
      return `“${fieldLabelOf(sections, scope.sectionId, scope.path)}” của ${sectionLabelOf(sections, scope.sectionId)}`;
  }
}

function capitalized(text: string): string {
  return text.charAt(0).toLocaleUpperCase('vi') + text.slice(1);
}

/** "Đang viết lại Hero…": the running state's line (board 21). */
export function runningLabelOf(action: AiAssistAction, title: string): string {
  switch (action) {
    case 'rewrite':
      return `Đang viết lại ${title}…`;
    case 'shorten':
      return `Đang rút gọn ${title}…`;
    case 'change_tone':
      return `Đang đổi giọng văn của ${title}…`;
    case 'suggest_heading':
      return `Đang gợi ý tiêu đề cho ${title}…`;
    case 'suggest_cta':
      return `Đang gợi ý CTA cho ${title}…`;
    case 'write_section':
      return `Đang viết nội dung ${title}…`;
    case 'suggest_seo':
      return 'Đang gợi ý SEO cho trang…';
    case 'custom':
      return `Đang viết theo yêu cầu cho ${title}…`;
  }
}

/** "Chưa viết lại được Hero": the failed state's heading. */
export function failedTitleOf(action: AiAssistAction, title: string): string {
  return action === 'rewrite' ? `Chưa viết lại được ${title}` : `Chưa có gợi ý cho ${title}`;
}

/** "Hero đã thay đổi trong lúc AI chạy". */
export function conflictTitleOf(title: string): string {
  return `${capitalized(title)} đã thay đổi trong lúc AI chạy`;
}

/** What happened when nothing came back; null failure is an answer that changed nothing. */
export function failureReasonOf(failure: AiFailure | null): string {
  switch (failure) {
    case null:
      return 'AI không đề xuất gì khác với chữ hiện có.';
    case 'ai_overloaded':
      return 'Dịch vụ AI đang quá tải.';
    case 'ai_timeout':
      return 'Dịch vụ AI phản hồi quá lâu.';
    case 'ai_invalid_output':
      return 'AI trả về nội dung không dùng được.';
    case 'interrupted':
      return 'Việc viết bị gián đoạn.';
    case 'ai_unavailable':
    case 'slug_taken':
    case 'page_limit_reached':
    case 'draft_changed':
      return 'Kết nối tới dịch vụ AI bị gián đoạn.';
  }
}

/* What an action can do in a scope. */

export interface ScopeOption {
  scope: AiSuggestionScope | null;
  label: string;
}

/**
 * The three scopes of the chooser: "Đoạn chữ" (the focused text of the selected section, when the
 * AI may write it), "Section …" (the selected section) and "Toàn trang". Null scope: unavailable.
 */
export function scopeOptionsOf(
  sections: readonly SectionInstance[],
  selectedId: string | null,
  focused: FocusedText | null,
): { field: ScopeOption; section: ScopeOption; page: ScopeOption } {
  const selected = selectedId === null ? undefined : sectionOf(sections, selectedId);
  const field =
    selected !== undefined &&
    focused !== null &&
    focused.sectionId === selected.id &&
    aiWritablePaths(selected).includes(focused.path)
      ? { kind: 'field' as const, sectionId: selected.id, path: focused.path }
      : null;
  return {
    field: { scope: field, label: 'Đoạn chữ' },
    section: {
      scope: selected === undefined ? null : { kind: 'section', sectionId: selected.id },
      label:
        selected === undefined ? 'Section' : `Section ${getSectionDefinition(selected.type).label}`,
    },
    page: { scope: { kind: 'page' }, label: 'Toàn trang' },
  };
}

/** Whether an action writes anything in the scope, and why not. */
export function actionBlockerOf(
  sections: readonly SectionInstance[],
  scope: AiSuggestionScope,
  action: AiAssistAction,
): string | null {
  if (action === 'suggest_seo') {
    if (scope.kind !== 'page') {
      return 'Chọn phạm vi Toàn trang để gợi ý SEO.';
    }
    return sections.length === 0 ? 'Trang chưa có chữ để gợi ý SEO.' : null;
  }
  if (action === 'write_section' && scope.kind !== 'section') {
    return 'Chọn phạm vi Section để viết nội dung cả section.';
  }
  const inScope =
    scope.kind === 'page' ? sections : sections.filter((section) => section.id === scope.sectionId);
  const writes = inScope.some((section) => {
    const paths = aiActionPaths(section, action);
    return scope.kind === 'field' ? paths.includes(scope.path) : paths.length > 0;
  });
  if (writes) {
    return null;
  }
  switch (action) {
    case 'suggest_heading':
      return 'Phạm vi này không có tiêu đề.';
    case 'suggest_cta':
      return 'Phạm vi này không có nút đang dùng.';
    default:
      return 'AI không viết chữ ở phạm vi này: đó là thông tin của doanh nghiệp.';
  }
}

/* Results. */

export function changeKeyOf(change: AiSuggestionChange): string {
  return textKey(change.sectionId, change.path);
}

/** The ok changes the user kept ticked, as the store's apply command takes them. */
export function acceptedChangesOf(
  result: Pick<AiSuggestionResult, 'changes'>,
  excluded: ReadonlySet<string>,
): AiDraftChange[] {
  return result.changes.flatMap((change): AiDraftChange[] =>
    change.status === 'ok' && !excluded.has(changeKeyOf(change))
      ? [
          {
            sectionId: change.sectionId,
            path: change.path,
            after: change.after,
            review: change.review,
          },
        ]
      : [],
  );
}

/**
 * "Thử lại" of one failed part: the request for it alone. A section's text is a "Đoạn chữ" request
 * with the same action ("Viết nội dung section" writes a field as "Viết lại"); an SEO text asks
 * for the SEO again.
 */
export function retryAskOf(ask: AssistAsk, change: AiSuggestionChange): AssistAsk {
  if (change.sectionId === AI_SEO_TARGET) {
    return { ...ask, scope: { kind: 'page' }, action: 'suggest_seo' };
  }
  return {
    ...ask,
    scope: { kind: 'field', sectionId: change.sectionId, path: change.path },
    action: ask.action === 'write_section' ? 'rewrite' : ask.action,
  };
}

/** The result with the retried part in place of the failed one, when the retry wrote it. */
export function mergeRetry(
  result: AiSuggestionResult,
  key: string,
  retried: AiSuggestionResult,
): { result: AiSuggestionResult; written: boolean } {
  const written = retried.changes.find(
    (change) => change.status === 'ok' && changeKeyOf(change) === key,
  );
  if (written === undefined) {
    return { result: { ...result, usage: retried.usage }, written: false };
  }
  return {
    result: {
      ...result,
      changes: result.changes.map((change) => (changeKeyOf(change) === key ? written : change)),
      charged: result.charged || retried.charged,
      usage: retried.usage,
    },
    written: true,
  };
}

/** "Lượt mới có vào 01/12" of a day "2026-12-01". */
export function dayMonthOf(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}
