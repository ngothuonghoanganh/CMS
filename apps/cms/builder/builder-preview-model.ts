import {
  builderPreviewForComponent,
  isPageComponentType,
  type BuilderPreviewAlign,
  type BuilderPreviewNode,
  type ComponentBuilderPreview,
  type PageComponentType,
} from '@payload/contracts';
import type { ComponentDefinition } from 'grapesjs';

import {
  BUILDER_NODE_TYPE_ATTRIBUTE,
  BUILDER_SEMANTIC_PREVIEW_ATTRIBUTE,
} from './builder-adapter';

type DefinitionStyle = Record<string, unknown>;

function definitionType(definition: ComponentDefinition): PageComponentType | undefined {
  const value = definition.attributes?.[BUILDER_NODE_TYPE_ATTRIBUTE];
  return typeof value === 'string' && isPageComponentType(value) ? value : undefined;
}

function definitionChildren(definition: ComponentDefinition): ComponentDefinition[] {
  const components = definition.components;
  if (!Array.isArray(components)) return [];
  return components.filter(
    (child): child is ComponentDefinition =>
      typeof child === 'object' &&
      child !== null &&
      child.attributes?.[BUILDER_SEMANTIC_PREVIEW_ATTRIBUTE] !== 'true',
  );
}

function styleValue(
  definition: ComponentDefinition,
  ...keys: string[]
): string | undefined {
  const style = definition.style as DefinitionStyle | undefined;
  for (const key of keys) {
    const value = style?.[key];
    if (typeof value === 'string') return value;
  }
  return undefined;
}

function alignValue(value: string | undefined): BuilderPreviewAlign | undefined {
  if (value === 'center') return 'center';
  if (value === 'flex-end' || value === 'end' || value === 'right') return 'end';
  if (value === 'flex-start' || value === 'start' || value === 'left') return 'start';
  return undefined;
}

function sectionTone(definition: ComponentDefinition): 'hero' | undefined {
  const background = styleValue(definition, 'backgroundColor', 'background-color');
  return background?.toLowerCase() === '#eff6ff' ? 'hero' : undefined;
}

function galleryColumns(definition: ComponentDefinition): 2 | 3 {
  const template = styleValue(definition, 'gridTemplateColumns', 'grid-template-columns');
  const match = template?.match(/repeat\(\s*([23])\s*,/);
  return match?.[1] === '2' ? 2 : 3;
}

function nodeForDefinition(definition: ComponentDefinition): BuilderPreviewNode {
  const type = definitionType(definition);
  const children = definitionChildren(definition);

  if (!type) {
    return {
      kind: 'box',
      role: 'panel',
      children: children.map(nodeForDefinition),
    };
  }

  if (type === 'section') {
    const tone = sectionTone(definition);
    return {
      kind: 'box',
      role: 'section',
      ...(tone ? { tone } : {}),
      children: children.map(nodeForDefinition),
    };
  }

  if (type === 'container') {
    const display = styleValue(definition, 'display');
    const direction = styleValue(definition, 'flexDirection', 'flex-direction');
    const align = alignValue(styleValue(definition, 'alignItems', 'align-items'));
    const isGrid = display === 'grid';
    const isVerticalFlex = display === 'flex' && direction === 'column';
    const content = isGrid
      ? [
          {
            kind: 'row' as const,
            ratios: children.map(() => 1),
            children: children.map(nodeForDefinition),
          },
        ]
      : isVerticalFlex
        ? [
            {
              kind: 'column' as const,
              ...(align ? { align } : {}),
              gap: 'normal' as const,
              children: children.map(nodeForDefinition),
            },
          ]
        : children.map(nodeForDefinition);

    return {
      kind: 'box',
      role: 'container',
      ...(align ? { align } : {}),
      children: content,
    };
  }

  if (type === 'global-header') {
    return {
      kind: 'row',
      ratios: children.map(() => 1),
      children: children.map(nodeForDefinition),
    };
  }

  if (type === 'global-footer') {
    return {
      kind: 'column',
      gap: 'tight',
      children: children.map(nodeForDefinition),
    };
  }

  if (type === 'gallery') {
    return { kind: 'gallery', columns: galleryColumns(definition) };
  }

  if (type === 'accordion') {
    const count = Math.min(3, Math.max(2, children.length)) as 2 | 3;
    return { kind: 'accordion', itemCount: count };
  }

  if (type === 'tabs') {
    const count = Math.min(3, Math.max(2, children.length)) as 2 | 3;
    return { kind: 'tabs', tabCount: count };
  }

  const registeredPreview = builderPreviewForComponent(type).tree;
  if (type === 'accordion-item' || type === 'tab-item') {
    return {
      kind: 'box',
      role: 'panel',
      children: children.length ? children.map(nodeForDefinition) : [registeredPreview],
    };
  }

  return registeredPreview;
}

/** Resolve a preview from the same definition that will be inserted into the canvas. */
export function resolveBuilderPreview(
  definition: ComponentDefinition,
  variant?: string,
): ComponentBuilderPreview {
  const type = definitionType(definition);
  return {
    kind: 'composition',
    variant: variant ?? type ?? 'definition',
    tree: nodeForDefinition(definition),
  };
}
