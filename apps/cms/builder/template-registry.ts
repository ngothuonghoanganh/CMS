import type { ComponentDefinition } from 'grapesjs';
import type { ComponentBuilderPreview } from '@payload/contracts';

import {
  createBlockPresetDefinition,
  getBlockPreset,
  type BlockPresetId,
} from './block-presets';

export type TemplateDefinition = {
  id: string;
  name: string;
  description: string;
  keywords: readonly string[];
  sourcePreset: BlockPresetId;
  preview: ComponentBuilderPreview;
  create: () => ComponentDefinition;
};

const template = (
  id: string,
  sourcePreset: BlockPresetId,
  name: string,
  description: string,
  keywords: readonly string[],
): TemplateDefinition => ({
  id,
  name,
  description,
  keywords,
  sourcePreset,
  preview: getBlockPreset(sourcePreset).preview,
  create: () => createBlockPresetDefinition(sourcePreset),
});

/** Built-in templates are normal compositions; no semantic template node is persisted. */
export const BUILT_IN_TEMPLATE_REGISTRY: readonly TemplateDefinition[] = [
  template(
    'hero-landing',
    'hero',
    'Hero landing section',
    'A ready-to-edit hero with heading, supporting copy, and CTA.',
    ['hero', 'landing', 'cta', 'marketing'],
  ),
  template(
    'conversion-cta',
    'cta',
    'Conversion CTA section',
    'A centered call-to-action composition for conversion-focused pages.',
    ['cta', 'conversion', 'button'],
  ),
  template(
    'split-content',
    'two-columns',
    'Split content section',
    'A responsive two-column composition for side-by-side content.',
    ['columns', 'split', 'grid', 'layout'],
  ),
];

export function getBuiltInTemplate(id: string): TemplateDefinition | undefined {
  return BUILT_IN_TEMPLATE_REGISTRY.find((candidate) => candidate.id === id);
}
