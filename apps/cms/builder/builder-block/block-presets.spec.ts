import { describe, expect, it } from 'vitest';

import {
  BUILDER_BLOCK_PRESET_REGISTRY,
  createBlockPresetDefinition,
  GLOBAL_HEADER_PRESET_REGISTRY,
  GLOBAL_FOOTER_PRESET_REGISTRY,
  createGlobalPresetDefinition,
} from './block-presets';
import {
  BUILDER_NODE_ID_ATTRIBUTE,
  BUILDER_NODE_TYPE_ATTRIBUTE,
  BUILDER_BUTTON_VARIANT_ATTRIBUTE,
  BUILDER_HEADING_LEVEL_ATTRIBUTE,
} from './builder-adapter';

function childDefinitions(
  definition: Record<string, unknown>,
): Record<string, unknown>[] {
  return Array.isArray(definition.components)
    ? (definition.components as Record<string, unknown>[])
    : [];
}

function attributesOf(definition: Record<string, unknown>): Record<string, unknown> {
  return (definition.attributes as Record<string, unknown> | undefined) ?? {};
}

describe('builder block presets', () => {
  it('keeps all presets in one registry with stable public ids', () => {
    expect(BUILDER_BLOCK_PRESET_REGISTRY.map((preset) => preset.id)).toEqual([
      'blank-section',
      'centered-section',
      'vertical-stack',
      'two-columns',
      'hero',
      'cta',
      'contact-form',
    ]);
  });

  it('creates fresh nested definitions without duplicate node ids', () => {
    const definition = createBlockPresetDefinition('hero') as Record<string, unknown>;
    const ids: string[] = [];
    function visit(current: Record<string, unknown>) {
      const attributes = current.attributes as Record<string, unknown> | undefined;
      if (typeof attributes?.[BUILDER_NODE_ID_ATTRIBUTE] === 'string') {
        ids.push(attributes[BUILDER_NODE_ID_ATTRIBUTE] as string);
      }
      childDefinitions(current).forEach(visit);
    }
    visit(definition);
    expect(attributesOf(definition)[BUILDER_NODE_TYPE_ATTRIBUTE]).toBe('section');
    expect(ids.length).toBeGreaterThan(3);
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      attributesOf(createBlockPresetDefinition('hero') as Record<string, unknown>)[
        BUILDER_NODE_ID_ATTRIBUTE
      ],
    ).not.toBe(ids[0]);
  });

  it('builds Two Columns with two real container children', () => {
    const definition = createBlockPresetDefinition('two-columns') as Record<
      string,
      unknown
    >;
    const columns = childDefinitions(definition)[0];
    expect(attributesOf(columns!)[BUILDER_NODE_TYPE_ATTRIBUTE]).toBe('container');
    expect(childDefinitions(columns!)).toHaveLength(2);
    expect(
      childDefinitions(columns!).every(
        (column) => attributesOf(column)[BUILDER_NODE_TYPE_ATTRIBUTE] === 'container',
      ),
    ).toBe(true);
  });

  it('keeps header and footer presets in document-specific registries', () => {
    expect(GLOBAL_HEADER_PRESET_REGISTRY).toHaveLength(2);
    expect(GLOBAL_FOOTER_PRESET_REGISTRY).toHaveLength(2);
    const header = createGlobalPresetDefinition('header-brand-menu-cta') as Record<
      string,
      unknown
    >;
    const footer = createGlobalPresetDefinition('footer-brand-menu-legal') as Record<
      string,
      unknown
    >;
    expect(attributesOf(header)[BUILDER_NODE_TYPE_ATTRIBUTE]).toBe('global-header');
    expect(attributesOf(footer)[BUILDER_NODE_TYPE_ATTRIBUTE]).toBe('global-footer');
    expect(childDefinitions(header)).toHaveLength(3);
    expect(childDefinitions(footer)).toHaveLength(3);
  });

  it('does not persist theme literals in built-in preset definitions', () => {
    const forbidden = new Set([
      'background-color',
      'color',
      'font-family',
      'font-size',
      'font-weight',
      'line-height',
      'border-radius',
      'box-shadow',
      'padding',
      'gap',
    ]);
    const definitions = [
      ...BUILDER_BLOCK_PRESET_REGISTRY.map((preset) => preset.create()),
      ...GLOBAL_HEADER_PRESET_REGISTRY.map((preset) => preset.create()),
      ...GLOBAL_FOOTER_PRESET_REGISTRY.map((preset) => preset.create()),
    ];
    for (const definition of definitions) {
      const visit = (current: Record<string, unknown>) => {
        const style = current.style as Record<string, unknown> | undefined;
        for (const property of Object.keys(style ?? {})) {
          expect(
            forbidden.has(property),
            `theme style ${property} found in ${String(
              attributesOf(definition)[BUILDER_NODE_TYPE_ATTRIBUTE],
            )}`,
          ).toBe(false);
        }
        childDefinitions(current).forEach(visit);
      };
      visit(definition as Record<string, unknown>);
    }
  });

  it('marks semantic intent on Hero children', () => {
    const hero = createBlockPresetDefinition('hero') as Record<string, unknown>;
    const container = childDefinitions(hero)[0]!;
    const [heading, , button] = childDefinitions(container);
    expect(attributesOf(heading!)[BUILDER_HEADING_LEVEL_ATTRIBUTE]).toBe('1');
    expect(attributesOf(button!)[BUILDER_BUTTON_VARIANT_ATTRIBUTE]).toBe('primary');
  });
});
