import type { ColorSchemeId, SectionType } from '@plp/contracts';
import type { z } from 'zod';

interface FieldBase {
  /** Key inside the content object (or inside a list item for item fields). */
  key: string;
  label: string;
  help?: string;
  /** An empty value blocks publishing (`required_field_empty`). Drafts may stay empty. */
  required?: boolean;
}

export interface TextField extends FieldBase {
  kind: 'text';
  maxLength: number;
  multiline: boolean;
  placeholder?: string;
}

/** A button: a short label plus where it leads ("Chữ trên nút" / "Khi bấm, đưa tới"). */
export interface CtaField extends FieldBase {
  kind: 'cta';
  labelMaxLength: number;
}

export interface ImageField extends FieldBase {
  kind: 'image';
  /** Shown as guidance, e.g. "1200 × 800 px". */
  recommendedSize?: string;
}

export interface SelectField extends FieldBase {
  kind: 'select';
  options: readonly { value: string; label: string }[];
}

export interface BooleanField extends FieldBase {
  kind: 'boolean';
}

export type LeafField = TextField | CtaField | ImageField | SelectField | BooleanField;

export interface ListField extends FieldBase {
  kind: 'list';
  /** Singular label for one item, e.g. "Lợi ích". */
  itemLabel: string;
  min: number;
  max: number;
  itemFields: readonly LeafField[];
  /** Key of the item field used as the item's title in the panel. */
  itemTitleKey: string;
  /** A fresh item with sample text, used by "Thêm" in the panel. */
  newItem(): Record<string, unknown>;
}

export type FieldDescriptor = LeafField | ListField;

export interface SectionVariant {
  id: string;
  label: string;
  description: string;
  /** The variant shows an image, so the mobile order setting applies. */
  hasMedia: boolean;
  /** Field keys this variant does not use; they are hidden in the panel and skipped by checks. */
  hiddenFields?: readonly string[];
  /**
   * Item minimums of list fields that are higher in this variant than the field's own `min`,
   * by list key: a grid needs at least 3 items, while the alternating layout works with 2.
   */
  listMin?: Readonly<Record<string, number>>;
}

export type SectionCategory =
  'navigation' | 'hero' | 'benefits' | 'social' | 'faq' | 'form' | 'cta' | 'footer';

export const sectionCategoryLabels: Record<SectionCategory, string> = {
  navigation: 'Thanh điều hướng',
  hero: 'Hero',
  benefits: 'Lợi ích & tính năng',
  social: 'Bằng chứng xã hội',
  faq: 'Câu hỏi thường gặp',
  form: 'Form & liên hệ',
  cta: 'Kêu gọi hành động',
  footer: 'Chân trang',
};

/**
 * Everything the platform knows about one section type: content schema, variants, limits and the
 * fields of the properties panel. The React component lives next to it in `@plp/sections/react`.
 */
export interface SectionDefinition<C extends Record<string, unknown> = Record<string, unknown>> {
  type: SectionType;
  label: string;
  description: string;
  category: SectionCategory;
  contentSchema: z.ZodType<C>;
  variants: readonly SectionVariant[];
  defaultVariant: string;
  defaultColorScheme: ColorSchemeId;
  fields: readonly FieldDescriptor[];
  /** At most one per page (navigation, footer). */
  singleton: boolean;
  /**
   * Fixed place on the page: the navigation bar is always first and the footer always last, so
   * every page keeps valid header/main/footer landmarks. Editors cannot move these sections.
   */
  position?: 'first' | 'last';
  /**
   * The section collects personal data (the lead form): a page holding it needs the site's consent
   * settings, and its releases snapshot them (ADR-016, ADR-017).
   */
  capturesLeads?: true;
  /** Fresh sample content for a newly added section. */
  sampleContent(): C;
  /** One line for the page structure list, e.g. the heading or "3 nhận xét". */
  summarize(content: C): string;
}

export type AnySectionDefinition = SectionDefinition;

export function defineSection<C extends Record<string, unknown>>(
  definition: SectionDefinition<C>,
): SectionDefinition<C> {
  return definition;
}
