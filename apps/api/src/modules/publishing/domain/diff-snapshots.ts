import type { ChangeItem, SectionInstance, Seo } from '@plp/contracts';
import { getSectionDefinition } from '@plp/sections/schema';
import { deepEqual } from './deep-equal.js';
import type { PageSnapshot } from './snapshot.js';

/** Everything that makes a section look different; `samplePaths` only follows content edits. */
const SECTION_PROPERTIES = [
  'type',
  'variant',
  'colorScheme',
  'spacing',
  'visibility',
  'mobileOrder',
  'content',
] as const satisfies readonly (keyof SectionInstance)[];

const SEO_LABELS: { field: keyof Seo; label: string }[] = [
  { field: 'title', label: 'SEO: tiêu đề' },
  { field: 'description', label: 'SEO: mô tả' },
  { field: 'shareImageAssetId', label: 'SEO: ảnh chia sẻ' },
  { field: 'noindex', label: 'SEO: hiển thị tìm kiếm' },
];

export const SLUG_CHANGE_LABEL = 'Đường dẫn';

function labelOf(section: SectionInstance): string {
  return getSectionDefinition(section.type).label;
}

function isModified(before: SectionInstance, after: SectionInstance): boolean {
  return SECTION_PROPERTIES.some((property) => !deepEqual(before[property], after[property]));
}

/**
 * Indexes (into `sequence`) of one longest strictly increasing subsequence. The sections on it kept
 * their relative order; every other common section counts as moved, which is the smallest set of
 * moves that explains the new order.
 */
function longestIncreasingIndexes(sequence: readonly number[]): Set<number> {
  const length: number[] = [];
  const previous: number[] = [];
  let best = -1;
  sequence.forEach((value, index) => {
    length[index] = 1;
    previous[index] = -1;
    for (let before = 0; before < index; before += 1) {
      const beforeValue = sequence[before] ?? Number.POSITIVE_INFINITY;
      const candidate = (length[before] ?? 0) + 1;
      if (beforeValue < value && candidate > (length[index] ?? 0)) {
        length[index] = candidate;
        previous[index] = before;
      }
    }
    if (best === -1 || (length[index] ?? 0) > (length[best] ?? 0)) {
      best = index;
    }
  });
  const kept = new Set<number>();
  for (let index = best; index !== -1; index = previous[index] ?? -1) {
    kept.add(index);
  }
  return kept;
}

/**
 * What changed from `base` to `next`, as the chips shown on the status, the publish dialog and the
 * release history ("Sửa: Hero", "SEO: tiêu đề"…). Sections are matched by instance id; a section
 * that changed and moved is reported once, as modified.
 */
export function diffSnapshots(base: PageSnapshot, next: PageSnapshot): ChangeItem[] {
  const baseSections = base.composition.sections;
  const nextSections = next.composition.sections;
  const baseById = new Map(baseSections.map((section, index) => [section.id, { section, index }]));
  const nextIds = new Set(nextSections.map((section) => section.id));

  const modifiedIds = new Set(
    nextSections
      .filter((section) => {
        const before = baseById.get(section.id)?.section;
        return before !== undefined && isModified(before, section);
      })
      .map((section) => section.id),
  );
  // Modified sections are reported as such, so only unmodified ones are compared for order.
  const unmodified = nextSections.filter(
    (section) => baseById.has(section.id) && !modifiedIds.has(section.id),
  );
  const kept = longestIncreasingIndexes(
    unmodified.map((section) => baseById.get(section.id)?.index ?? -1),
  );
  const movedIds = new Set(
    unmodified.filter((_section, index) => !kept.has(index)).map((section) => section.id),
  );

  const changes: ChangeItem[] = [];
  for (const section of nextSections) {
    if (!baseById.has(section.id)) {
      changes.push({ kind: 'added', label: `Thêm: ${labelOf(section)}`, sectionId: section.id });
    } else if (modifiedIds.has(section.id)) {
      changes.push({ kind: 'modified', label: `Sửa: ${labelOf(section)}`, sectionId: section.id });
    } else if (movedIds.has(section.id)) {
      changes.push({
        kind: 'moved',
        label: `Đổi vị trí: ${labelOf(section)}`,
        sectionId: section.id,
      });
    }
  }
  for (const section of baseSections) {
    if (!nextIds.has(section.id)) {
      changes.push({ kind: 'removed', label: `Xóa: ${labelOf(section)}`, sectionId: section.id });
    }
  }
  if (base.slug !== next.slug) {
    changes.push({ kind: 'slug', label: SLUG_CHANGE_LABEL, sectionId: null });
  }
  for (const { field, label } of SEO_LABELS) {
    if (!deepEqual(base.seo[field], next.seo[field])) {
      changes.push({ kind: 'seo', label, sectionId: null });
    }
  }
  return changes;
}
