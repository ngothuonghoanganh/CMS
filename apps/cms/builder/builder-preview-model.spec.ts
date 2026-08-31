import { describe, expect, it } from 'vitest';

import {
  BUILDER_BLOCK_PRESET_REGISTRY,
  GLOBAL_FOOTER_PRESET_REGISTRY,
  GLOBAL_HEADER_PRESET_REGISTRY,
} from './block-presets';
import { createBlockDefinition } from './builder-adapter';
import { resolveBuilderPreview } from './builder-preview-model';
import { PAGE_COMPONENT_REGISTRY } from '@payload/contracts';

function serializedPreview(preview: unknown): string {
  return JSON.stringify(preview);
}

describe('builder composition previews', () => {
  it('provides a concrete composition tree for every built-in registry entry', () => {
    for (const definition of Object.values(PAGE_COMPONENT_REGISTRY)) {
      expect(definition.builder.preview.kind).toBe('composition');
      expect(definition.builder.preview.tree).toBeDefined();
      expect(definition.builder.preview.variant).toBe(definition.type);
    }
  });

  it('derives preset previews from their real component definitions', () => {
    const hero = BUILDER_BLOCK_PRESET_REGISTRY.find((preset) => preset.id === 'hero');
    const cta = BUILDER_BLOCK_PRESET_REGISTRY.find((preset) => preset.id === 'cta');
    const columns = BUILDER_BLOCK_PRESET_REGISTRY.find(
      (preset) => preset.id === 'two-columns',
    );

    expect(hero?.preview.tree).toMatchObject({
      kind: 'box',
      role: 'section',
      tone: 'hero',
    });
    expect(cta?.preview.tree).not.toEqual(hero?.preview.tree);
    expect(columns?.preview.tree).toMatchObject({
      kind: 'box',
      children: [{ kind: 'box', children: [{ kind: 'row' }] }],
    });
  });

  it('keeps each built-in preset composition visually distinct', () => {
    const previews = [
      ...BUILDER_BLOCK_PRESET_REGISTRY,
      ...GLOBAL_HEADER_PRESET_REGISTRY,
      ...GLOBAL_FOOTER_PRESET_REGISTRY,
    ].map((preset) => serializedPreview(preset.preview.tree));

    expect(new Set(previews).size).toBe(previews.length);
  });

  it('derives compound and media shapes from the inserted definition', () => {
    expect(resolveBuilderPreview(createBlockDefinition('accordion')).tree).toMatchObject({
      kind: 'accordion',
      itemCount: 2,
    });
    expect(resolveBuilderPreview(createBlockDefinition('tabs')).tree).toMatchObject({
      kind: 'tabs',
      tabCount: 2,
    });
    expect(resolveBuilderPreview(createBlockDefinition('gallery')).tree).toMatchObject({
      kind: 'gallery',
      columns: 3,
    });
    expect(resolveBuilderPreview(createBlockDefinition('form')).tree).toEqual({
      kind: 'form',
    });
  });
});
