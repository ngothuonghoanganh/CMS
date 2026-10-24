import { altTextSchema, type SectionInstance, type SectionType } from '@plp/contracts';
import {
  type LeafField,
  type ListField,
  getAtPath,
  getSectionDefinition,
  getVariant,
  isPathWithin,
  samplePathsOf,
  splitPath,
} from '@plp/sections/schema';

/** Maximum length of an image description, from the contract (`altTextSchema`). */
export const ALT_MAX_LENGTH = altTextSchema.maxLength ?? 250;

/** What a content path of a section points at, according to the section definition. */
export type PathTarget =
  | {
      kind: 'leaf';
      field: LeafField;
      /** Segments below the leaf, e.g. `['label']` for "primaryCta.label". */
      rest: readonly (string | number)[];
    }
  | { kind: 'list'; field: ListField }
  | { kind: 'item'; field: ListField; index: number };

/** Resolves "items.2.title" to the list field and its `title` item field, and so on. */
export function resolvePath(type: SectionType, path: string): PathTarget | null {
  const definition = getSectionDefinition(type);
  const [key, ...rest] = splitPath(path);
  const field = definition.fields.find((candidate) => candidate.key === key);
  if (!field) {
    return null;
  }
  if (field.kind !== 'list') {
    return { kind: 'leaf', field, rest };
  }
  const [index, itemKey, ...below] = rest;
  if (index === undefined) {
    return { kind: 'list', field };
  }
  if (typeof index !== 'number') {
    return null;
  }
  if (itemKey === undefined) {
    return { kind: 'item', field, index };
  }
  const itemField = field.itemFields.find((candidate) => candidate.key === itemKey);
  return itemField ? { kind: 'leaf', field: itemField, rest: below } : null;
}

/** Whether a field key (or "list.itemKey") is hidden by the section's current variant. */
export function isFieldHidden(
  section: Pick<SectionInstance, 'type' | 'variant'>,
  key: string,
): boolean {
  const variant = getVariant(getSectionDefinition(section.type), section.variant);
  return variant?.hiddenFields?.includes(key) ?? false;
}

/** Cuts text to `max` UTF-16 units without leaving half of a surrogate pair at the end. */
export function clampText(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  const cut = value.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clampLabelOf(value: unknown, max: number): unknown {
  if (isRecord(value) && typeof value.label === 'string') {
    return { ...value, label: clampText(value.label, max) };
  }
  return value;
}

function clampAltOf(value: unknown): unknown {
  if (isRecord(value) && typeof value.alt === 'string') {
    return { ...value, alt: clampText(value.alt, ALT_MAX_LENGTH) };
  }
  return value;
}

/**
 * Applies the field's length limit to a new value: text fields, button labels and image
 * descriptions are cut to their maximum, so the draft never holds text the schema would reject.
 */
export function clampToField(target: Extract<PathTarget, { kind: 'leaf' }>, value: unknown) {
  const { field, rest } = target;
  const [sub] = rest;
  switch (field.kind) {
    case 'text':
      return rest.length === 0 && typeof value === 'string'
        ? clampText(value, field.maxLength)
        : value;
    case 'cta':
      if (rest.length === 0) {
        return clampLabelOf(value, field.labelMaxLength);
      }
      return sub === 'label' && rest.length === 1 && typeof value === 'string'
        ? clampText(value, field.labelMaxLength)
        : value;
    case 'image':
      if (rest.length === 0) {
        return clampAltOf(value);
      }
      return sub === 'alt' && rest.length === 1 && typeof value === 'string'
        ? clampText(value, ALT_MAX_LENGTH)
        : value;
    case 'select':
    case 'boolean':
      return value;
  }
}

/**
 * True when every segment above the last one exists, so `setAtPath` can write the value. Writing
 * into a missing list item would otherwise create holes or throw.
 */
export function canWriteAt(content: unknown, path: string): boolean {
  const parts = splitPath(path);
  let current: unknown = content;
  for (const part of parts.slice(0, -1)) {
    if (Array.isArray(current) && typeof part === 'number') {
      if (part < 0 || part >= current.length) {
        return false;
      }
      current = current[part];
    } else if (isRecord(current) && typeof part === 'string') {
      current = current[part];
    } else {
      return false;
    }
  }
  const last = parts[parts.length - 1];
  if (Array.isArray(current)) {
    return typeof last === 'number' && last >= 0 && last < current.length;
  }
  return isRecord(current) && typeof last === 'string';
}

/** Sample markers that stay after `path` was edited: the path and everything below it go. */
export function withoutSamplePath(samplePaths: readonly string[], path: string): string[] {
  return samplePaths.filter((samplePath) => !isPathWithin(samplePath, path));
}

/**
 * Renumbers the sample markers of a list after items were removed or reordered. `mapIndex` gives
 * the new index of an old one, or null when that item is gone.
 */
export function remapListPaths(
  samplePaths: readonly string[],
  listKey: string,
  mapIndex: (index: number) => number | null,
): string[] {
  const prefix = `${listKey}.`;
  const result: string[] = [];
  for (const samplePath of samplePaths) {
    if (!samplePath.startsWith(prefix)) {
      result.push(samplePath);
      continue;
    }
    const [indexPart, ...below] = samplePath.slice(prefix.length).split('.');
    const index = Number(indexPart);
    if (!Number.isInteger(index)) {
      result.push(samplePath);
      continue;
    }
    const next = mapIndex(index);
    if (next !== null) {
      result.push([listKey, String(next), ...below].join('.'));
    }
  }
  return result;
}

/** Sample markers of a freshly added list item placed at `index`. */
export function samplePathsOfNewItem(
  section: Pick<SectionInstance, 'type' | 'variant' | 'content'>,
  listKey: string,
  item: Record<string, unknown>,
  index: number,
): string[] {
  const probe = { ...section, content: { ...section.content, [listKey]: [item] } };
  const prefix = `${listKey}.0.`;
  return samplePathsOf(probe)
    .filter((path) => path.startsWith(prefix))
    .map((path) => `${listKey}.${index}.${path.slice(prefix.length)}`);
}

/** The items of a list field as records, or an empty array when the content is malformed. */
export function listItemsOf(content: unknown, listKey: string): Record<string, unknown>[] {
  const items = getAtPath(content, listKey);
  return Array.isArray(items) ? items.filter(isRecord) : [];
}
