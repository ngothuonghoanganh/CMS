import {
  foldVietnamese,
  type PageGoal,
  pageGoalIds,
  type TemplateIndustry,
  templateIndustries,
  templateIndustryLabels,
  type TemplateSource,
  templateSources,
  type TemplateSummary,
} from '@plp/contracts';
import { goalDefinitions } from '@plp/sections/schema';

/*
 * The library of board 17 as pure functions: tabs by source, a search that ignores accents, and
 * filters by goal, industry and "Có form thu lead", with their counts and removable chips.
 */

/**
 * "Tất cả" and one tab per source. "Của workspace" is board 19, the list of the workspace's own
 * templates, at the same address (`?source=workspace`).
 */
export type LibraryTab = 'all' | TemplateSource;

export interface LibraryTabDefinition {
  tab: LibraryTab;
  label: string;
  /** The sources its cards come from. */
  sources: readonly TemplateSource[];
}

export const libraryTabs: readonly LibraryTabDefinition[] = [
  { tab: 'all', label: 'Tất cả', sources: templateSources },
  { tab: 'system', label: 'Hệ thống', sources: ['system'] },
  { tab: 'workspace', label: 'Của workspace', sources: ['workspace'] },
];

/** The tab of `?source=`; anything else is "Tất cả". */
export function tabOf(source: string | undefined): LibraryTab {
  return libraryTabs.find((item) => item.tab === source)?.tab ?? 'all';
}

export function inTab(template: Pick<TemplateSummary, 'source'>, tab: LibraryTab): boolean {
  return libraryTabs.some((item) => item.tab === tab && item.sources.includes(template.source));
}

export function goalLabel(goal: PageGoal): string {
  return goalDefinitions[goal].title;
}

/**
 * The line under a card's description: "Thu lead · 8 section", and the workspace's name for its
 * own templates ("Thu lead · 7 section · Mây Xanh Agency"). A workspace template may have no goal.
 */
export function templateMeta(
  template: Pick<TemplateSummary, 'goal' | 'sections' | 'source'>,
  workspaceName: string,
): string {
  return [
    template.goal === null ? null : goalLabel(template.goal),
    `${template.sections.length} section`,
    template.source === 'workspace' ? workspaceName : null,
  ]
    .filter((part) => part !== null)
    .join(' · ');
}

/** Goal and industry of a template, "Thu lead · Nha khoa & y tế", as far as they are set. */
export function templateTags(template: Pick<TemplateSummary, 'goal' | 'industry'>): string {
  return [
    template.goal === null ? null : goalLabel(template.goal),
    template.industry === null ? null : templateIndustryLabels[template.industry],
  ]
    .filter((part) => part !== null)
    .join(' · ');
}

export interface LibraryFilters {
  goals: readonly PageGoal[];
  industries: readonly TemplateIndustry[];
  /** "Có form thu lead". */
  withForm: boolean;
}

export const NO_FILTERS: LibraryFilters = { goals: [], industries: [], withForm: false };

export function hasFilters(filters: LibraryFilters): boolean {
  return filters.goals.length > 0 || filters.industries.length > 0 || filters.withForm;
}

/** Words without accents or case: "Nhà hàng & F&B" → ["nha", "hang", "f", "b"]. */
function wordsOf(text: string): string[] {
  return foldVietnamese(text)
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== '');
}

/**
 * The search, without accents or case: "nha khoa" finds "Nha khoa & y tế", "uu dai nha khoa"
 * finds "Ưu đãi dịch vụ nha khoa". Each word is a whole word of the name, description, industry
 * or goal, so "nha" does not find "cảm nhận"; the last one may be a beginning, as it is still
 * being typed ("nha kh").
 */
export function matchesQuery(template: TemplateSummary, query: string): boolean {
  const words = wordsOf(query);
  const last = words.pop();
  if (last === undefined) {
    return true;
  }
  const haystack = wordsOf([template.name, template.description, templateTags(template)].join(' '));
  return (
    words.every((word) => haystack.includes(word)) && haystack.some((word) => word.startsWith(last))
  );
}

type FilterGroup = 'goals' | 'industries' | 'withForm';

/**
 * Whether a template passes the filters: any checked goal, any checked industry, and a form when
 * asked. `except` leaves one group out, for that group's own counts.
 */
function matchesFilters(
  template: TemplateSummary,
  filters: LibraryFilters,
  except?: FilterGroup,
): boolean {
  const { goal, industry } = template;
  return (
    (except === 'goals' ||
      filters.goals.length === 0 ||
      (goal !== null && filters.goals.includes(goal))) &&
    (except === 'industries' ||
      filters.industries.length === 0 ||
      (industry !== null && filters.industries.includes(industry))) &&
    (except === 'withForm' || !filters.withForm || template.hasForm)
  );
}

export interface LibraryQuery {
  tab: LibraryTab;
  query: string;
  filters: LibraryFilters;
}

/** The cards to show, in the catalog's order. */
export function visibleTemplates(
  templates: readonly TemplateSummary[],
  { tab, query, filters }: LibraryQuery,
): TemplateSummary[] {
  return templates.filter(
    (template) =>
      inTab(template, tab) && matchesQuery(template, query) && matchesFilters(template, filters),
  );
}

/** "Tất cả · 12": the templates of each tab, before search and filters. */
export function tabCounts(templates: readonly TemplateSummary[]): Record<LibraryTab, number> {
  const counts = Object.fromEntries(libraryTabs.map(({ tab }) => [tab, 0])) as Record<
    LibraryTab,
    number
  >;
  for (const template of templates) {
    for (const { tab } of libraryTabs) {
      if (inTab(template, tab)) {
        counts[tab] += 1;
      }
    }
  }
  return counts;
}

export interface FilterOption<V extends string> {
  value: V;
  label: string;
  /** Cards this option would show with the other groups as they are. */
  count: number;
  checked: boolean;
}

export interface FilterGroups {
  goals: FilterOption<PageGoal>[];
  industries: FilterOption<TemplateIndustry>[];
  withForm: { count: number; checked: boolean };
}

/**
 * The options of each group with their counts, within the tab and the search. An option counts
 * the cards it would show with the other groups' choices, so a 0 warns before it empties the list.
 */
export function filterGroups(
  templates: readonly TemplateSummary[],
  { tab, query, filters }: LibraryQuery,
): FilterGroups {
  const pool = templates.filter(
    (template) => inTab(template, tab) && matchesQuery(template, query),
  );
  const countWhere = (except: FilterGroup, test: (template: TemplateSummary) => boolean) =>
    pool.filter((template) => matchesFilters(template, filters, except) && test(template)).length;
  return {
    goals: pageGoalIds.map((goal) => ({
      value: goal,
      label: goalLabel(goal),
      count: countWhere('goals', (template) => template.goal === goal),
      checked: filters.goals.includes(goal),
    })),
    industries: templateIndustries.map((industry) => ({
      value: industry,
      label: templateIndustryLabels[industry],
      count: countWhere('industries', (template) => template.industry === industry),
      checked: filters.industries.includes(industry),
    })),
    withForm: {
      count: countWhere('withForm', (template) => template.hasForm),
      checked: filters.withForm,
    },
  };
}

function toggled<V>(values: readonly V[], value: V, on: boolean): V[] {
  const without = values.filter((item) => item !== value);
  return on ? [...without, value] : without;
}

export function withGoal(filters: LibraryFilters, goal: PageGoal, on: boolean): LibraryFilters {
  return { ...filters, goals: toggled(filters.goals, goal, on) };
}

export function withIndustry(
  filters: LibraryFilters,
  industry: TemplateIndustry,
  on: boolean,
): LibraryFilters {
  return { ...filters, industries: toggled(filters.industries, industry, on) };
}

export const WITH_FORM_LABEL = 'Có form thu lead';

export interface FilterChip {
  /** Unique among the chips, for React and for focus after one is removed. */
  key: string;
  label: string;
  /** The filters once this chip is removed. */
  without: LibraryFilters;
}

/** "Đang lọc:" chips, in the order the options were checked within each group. */
export function filterChips(filters: LibraryFilters): FilterChip[] {
  return [
    ...filters.goals.map((goal) => ({
      key: `goal:${goal}`,
      label: goalLabel(goal),
      without: withGoal(filters, goal, false),
    })),
    ...filters.industries.map((industry) => ({
      key: `industry:${industry}`,
      label: templateIndustryLabels[industry],
      without: withIndustry(filters, industry, false),
    })),
    ...(filters.withForm
      ? [{ key: 'form', label: WITH_FORM_LABEL, without: { ...filters, withForm: false } }]
      : []),
  ];
}

export interface EmptyMessage {
  title: string;
  description: string;
}

/**
 * Why the list is empty, as precise as the choice: board 17's "Chưa có mẫu “Webinar” cho ngành Bất
 * động sản" for one goal in one industry.
 */
export function emptyMessage({ query, filters }: Omit<LibraryQuery, 'tab'>): EmptyMessage {
  const [goal] = filters.goals;
  const [industry] = filters.industries;
  const search = query.trim();
  const description = hasFilters(filters)
    ? 'Thử bỏ bớt một bộ lọc hoặc đổi từ khóa tìm kiếm.'
    : 'Thử một từ khóa khác, ví dụ tên ngành hay mục tiêu của trang.';
  if (
    search === '' &&
    !filters.withForm &&
    filters.goals.length === 1 &&
    filters.industries.length === 1 &&
    goal !== undefined &&
    industry !== undefined
  ) {
    return {
      title: `Chưa có mẫu “${goalLabel(goal)}” cho ngành ${templateIndustryLabels[industry]}`,
      description,
    };
  }
  return {
    title: search === '' ? 'Không có mẫu nào khớp bộ lọc' : `Không có mẫu nào khớp “${search}”`,
    description,
  };
}
