import type { PageGoal, SectionInstance, SectionType } from '@plp/contracts';
import {
  getSectionDefinition,
  isRecommendedFor,
  type SectionCategory,
  sectionCategoryLabels,
  sectionOrder,
} from '@plp/sections/schema';

/** One card of the "Thêm section" dialog: a section type in one variant. */
export interface CatalogCard {
  key: string;
  type: SectionType;
  variant: string;
  category: SectionCategory;
  sectionLabel: string;
  name: string;
  description: string;
  /** "Hợp mục tiêu": the variant belongs to the page goal's blueprint. */
  recommended: boolean;
  /** Why the card cannot be added, e.g. "Đã có trên trang". */
  unavailableReason: string | null;
}

export interface CatalogCategory {
  id: SectionCategory;
  label: string;
  count: number;
}

export function buildCatalog(
  sections: readonly Pick<SectionInstance, 'type'>[],
  goal: PageGoal | null,
): CatalogCard[] {
  const present = new Set(sections.map((section) => section.type));
  return sectionOrder.flatMap((type) => {
    const definition = getSectionDefinition(type);
    const taken = definition.singleton && present.has(type);
    return definition.variants.map((variant) => ({
      key: `${type}:${variant.id}`,
      type,
      variant: variant.id,
      category: definition.category,
      sectionLabel: definition.label,
      name: variant.label,
      description: variant.description,
      recommended: goal !== null && isRecommendedFor(goal, type, variant.id),
      unavailableReason: taken ? 'Đã có trên trang' : null,
    }));
  });
}

/** Lowercase without Vietnamese diacritics, so "nhan xet" finds "Nhận xét". */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim();
}

export function filterCatalog(cards: readonly CatalogCard[], query: string): CatalogCard[] {
  const needle = normalizeSearch(query);
  if (needle === '') {
    return [...cards];
  }
  return cards.filter((card) =>
    normalizeSearch(
      `${card.sectionLabel} ${card.name} ${card.description} ${sectionCategoryLabels[card.category]}`,
    ).includes(needle),
  );
}

/** Categories that have cards, in catalog order, with their card counts. */
export function categoriesOf(cards: readonly CatalogCard[]): CatalogCategory[] {
  const counts = new Map<SectionCategory, number>();
  for (const card of cards) {
    counts.set(card.category, (counts.get(card.category) ?? 0) + 1);
  }
  return [...counts.entries()].map(([id, count]) => ({
    id,
    label: sectionCategoryLabels[id],
    count,
  }));
}
