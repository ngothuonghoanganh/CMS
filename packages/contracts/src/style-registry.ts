import type { ComponentPropertyDefinition } from './component-registry';

/**
 * The responsive vocabulary is shared by the editor and production renderer.
 * `editorMediaQuery` is the max-width value used by GrapesJS' device manager;
 * `maxWidth` is the same inclusive CSS media-query bound emitted by the
 * production renderer.
 */
export const PAGE_RESPONSIVE_BREAKPOINTS = {
  desktop: {
    label: 'Desktop',
    payloadKey: 'base',
    canvasWidth: '',
    editorMediaQuery: undefined,
    maxWidth: undefined,
  },
  tablet: {
    label: 'Tablet',
    payloadKey: 'tablet',
    canvasWidth: '640px',
    editorMediaQuery: '991px',
    maxWidth: 991,
  },
  mobile: {
    label: 'Mobile',
    payloadKey: 'mobile',
    canvasWidth: '375px',
    editorMediaQuery: '479px',
    maxWidth: 479,
  },
} as const;

export type PageResponsiveViewport = keyof typeof PAGE_RESPONSIVE_BREAKPOINTS;
export type PagePayloadViewport =
  (typeof PAGE_RESPONSIVE_BREAKPOINTS)[PageResponsiveViewport]['payloadKey'];

export type PageStylePropertyDefinition = ComponentPropertyDefinition & {
  payloadKey: string;
  cssProperty: string;
  editorProperty: string;
};

const option = (label: string, value: string) => ({ label, value });

/**
 * Single source of truth for style capabilities exposed to the builder and
 * translated by the renderer. `key` is the editor-facing kebab-case key;
 * `payloadKey` is the persisted PageNodeStyle key.
 */
export const PAGE_STYLE_PROPERTY_DEFINITIONS = [
  {
    key: 'display',
    payloadKey: 'display',
    cssProperty: 'display',
    editorProperty: 'display',
    label: 'Display',
    group: 'style',
    control: 'select',
    responsive: true,
    options: [
      option('Default', ''),
      option('Block', 'block'),
      option('Flex', 'flex'),
      option('Grid', 'grid'),
      option('Inline', 'inline'),
      option('Inline block', 'inline-block'),
      option('Hidden', 'none'),
    ],
  },
  {
    key: 'flex-direction',
    payloadKey: 'flexDirection',
    cssProperty: 'flex-direction',
    editorProperty: 'flex-direction',
    label: 'Direction',
    group: 'style',
    control: 'segmented',
    responsive: true,
    options: [option('Horizontal', 'row'), option('Vertical', 'column')],
  },
  {
    key: 'justify-content',
    payloadKey: 'justifyContent',
    cssProperty: 'justify-content',
    editorProperty: 'justify-content',
    label: 'Justify',
    group: 'style',
    control: 'select',
    responsive: true,
    options: [
      option('Start', 'flex-start'),
      option('Center', 'center'),
      option('End', 'flex-end'),
      option('Space between', 'space-between'),
      option('Space around', 'space-around'),
      option('Space evenly', 'space-evenly'),
    ],
  },
  {
    key: 'align-items',
    payloadKey: 'alignItems',
    cssProperty: 'align-items',
    editorProperty: 'align-items',
    label: 'Align',
    group: 'style',
    control: 'select',
    responsive: true,
    options: [
      option('Start', 'flex-start'),
      option('Center', 'center'),
      option('End', 'flex-end'),
      option('Stretch', 'stretch'),
      option('Baseline', 'baseline'),
    ],
  },
  {
    key: 'flex-wrap',
    payloadKey: 'flexWrap',
    cssProperty: 'flex-wrap',
    editorProperty: 'flex-wrap',
    label: 'Wrap',
    group: 'style',
    control: 'select',
    responsive: true,
    options: [option('No wrap', 'nowrap'), option('Wrap', 'wrap')],
  },
  {
    key: 'grid-template-columns',
    payloadKey: 'gridTemplateColumns',
    cssProperty: 'grid-template-columns',
    editorProperty: 'grid-template-columns',
    label: 'Grid columns',
    group: 'style',
    control: 'text',
    responsive: true,
    description: 'Example: repeat(3, minmax(0, 1fr))',
  },
  {
    key: 'position',
    payloadKey: 'position',
    cssProperty: 'position',
    editorProperty: 'position',
    label: 'Position',
    group: 'style',
    control: 'select',
    responsive: true,
    options: [
      option('Static', 'static'),
      option('Relative', 'relative'),
      option('Sticky', 'sticky'),
      option('Absolute', 'absolute'),
    ],
  },
  {
    key: 'width',
    payloadKey: 'width',
    cssProperty: 'width',
    editorProperty: 'width',
    label: 'Width',
    group: 'style',
    control: 'unit',
    responsive: true,
    allowAuto: true,
  },
  {
    key: 'height',
    payloadKey: 'height',
    cssProperty: 'height',
    editorProperty: 'height',
    label: 'Height',
    group: 'style',
    control: 'unit',
    responsive: true,
    allowAuto: true,
  },
  {
    key: 'min-width',
    payloadKey: 'minWidth',
    cssProperty: 'min-width',
    editorProperty: 'min-width',
    label: 'Min width',
    group: 'style',
    control: 'unit',
    responsive: true,
  },
  {
    key: 'max-width',
    payloadKey: 'maxWidth',
    cssProperty: 'max-width',
    editorProperty: 'max-width',
    label: 'Max width',
    group: 'style',
    control: 'unit',
    responsive: true,
  },
  {
    key: 'min-height',
    payloadKey: 'minHeight',
    cssProperty: 'min-height',
    editorProperty: 'min-height',
    label: 'Min height',
    group: 'style',
    control: 'unit',
    responsive: true,
  },
  {
    key: 'max-height',
    payloadKey: 'maxHeight',
    cssProperty: 'max-height',
    editorProperty: 'max-height',
    label: 'Max height',
    group: 'style',
    control: 'unit',
    responsive: true,
  },
  {
    key: 'gap',
    payloadKey: 'gap',
    cssProperty: 'gap',
    editorProperty: 'gap',
    label: 'Gap',
    group: 'style',
    control: 'unit',
    responsive: true,
    allowAuto: true,
  },
  {
    key: 'padding',
    payloadKey: 'padding',
    cssProperty: 'padding',
    editorProperty: 'padding',
    label: 'Padding',
    group: 'style',
    control: 'spacing',
    responsive: true,
  },
  {
    key: 'margin',
    payloadKey: 'margin',
    cssProperty: 'margin',
    editorProperty: 'margin',
    label: 'Margin',
    group: 'style',
    control: 'spacing',
    responsive: true,
    allowAuto: true,
  },
  {
    key: 'font-family',
    payloadKey: 'fontFamily',
    cssProperty: 'font-family',
    editorProperty: 'font-family',
    label: 'Font family',
    group: 'style',
    control: 'text',
    responsive: true,
  },
  {
    key: 'color',
    payloadKey: 'color',
    cssProperty: 'color',
    editorProperty: 'color',
    label: 'Text color',
    group: 'style',
    control: 'color',
    responsive: true,
  },
  {
    key: 'font-size',
    payloadKey: 'fontSize',
    cssProperty: 'font-size',
    editorProperty: 'font-size',
    label: 'Font size',
    group: 'style',
    control: 'unit',
    responsive: true,
  },
  {
    key: 'font-weight',
    payloadKey: 'fontWeight',
    cssProperty: 'font-weight',
    editorProperty: 'font-weight',
    label: 'Font weight',
    group: 'style',
    control: 'select',
    responsive: true,
    options: [
      option('Default', ''),
      option('Regular (400)', '400'),
      option('Medium (500)', '500'),
      option('Semibold (600)', '600'),
      option('Bold (700)', '700'),
      option('Extra bold (800)', '800'),
    ],
  },
  {
    key: 'line-height',
    payloadKey: 'lineHeight',
    cssProperty: 'line-height',
    editorProperty: 'line-height',
    label: 'Line height',
    group: 'style',
    control: 'unit',
    responsive: true,
  },
  {
    key: 'letter-spacing',
    payloadKey: 'letterSpacing',
    cssProperty: 'letter-spacing',
    editorProperty: 'letter-spacing',
    label: 'Letter spacing',
    group: 'style',
    control: 'unit',
    responsive: true,
  },
  {
    key: 'text-align',
    payloadKey: 'textAlign',
    cssProperty: 'text-align',
    editorProperty: 'text-align',
    label: 'Text alignment',
    group: 'style',
    control: 'segmented',
    responsive: true,
    options: [
      option('Left', 'left'),
      option('Center', 'center'),
      option('Right', 'right'),
    ],
  },
  {
    key: 'text-decoration',
    payloadKey: 'textDecoration',
    cssProperty: 'text-decoration',
    editorProperty: 'text-decoration',
    label: 'Text decoration',
    group: 'style',
    control: 'select',
    responsive: true,
    options: [
      option('None', 'none'),
      option('Underline', 'underline'),
      option('Strike', 'line-through'),
    ],
  },
  {
    key: 'background-color',
    payloadKey: 'backgroundColor',
    cssProperty: 'background-color',
    editorProperty: 'background-color',
    label: 'Background',
    group: 'style',
    control: 'color',
    responsive: true,
  },
  {
    key: 'border-width',
    payloadKey: 'borderWidth',
    cssProperty: 'border-width',
    editorProperty: 'border-width',
    label: 'Border width',
    group: 'style',
    control: 'unit',
    responsive: true,
  },
  {
    key: 'border-style',
    payloadKey: 'borderStyle',
    cssProperty: 'border-style',
    editorProperty: 'border-style',
    label: 'Border style',
    group: 'style',
    control: 'select',
    responsive: true,
    options: [
      option('None', 'none'),
      option('Solid', 'solid'),
      option('Dashed', 'dashed'),
      option('Dotted', 'dotted'),
    ],
  },
  {
    key: 'border-color',
    payloadKey: 'borderColor',
    cssProperty: 'border-color',
    editorProperty: 'border-color',
    label: 'Border color',
    group: 'style',
    control: 'color',
    responsive: true,
  },
  {
    key: 'border-radius',
    payloadKey: 'borderRadius',
    cssProperty: 'border-radius',
    editorProperty: 'border-radius',
    label: 'Radius',
    group: 'style',
    control: 'unit',
    responsive: true,
  },
  {
    key: 'opacity',
    payloadKey: 'opacity',
    cssProperty: 'opacity',
    editorProperty: 'opacity',
    label: 'Opacity',
    group: 'style',
    control: 'number',
    responsive: true,
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    key: 'box-shadow',
    payloadKey: 'boxShadow',
    cssProperty: 'box-shadow',
    editorProperty: 'box-shadow',
    label: 'Shadow',
    group: 'style',
    control: 'text',
    responsive: true,
  },
] satisfies readonly PageStylePropertyDefinition[];

export type PageStylePropertyKey =
  (typeof PAGE_STYLE_PROPERTY_DEFINITIONS)[number]['key'];

export const PAGE_STYLE_PROPERTY_BY_EDITOR_KEY = Object.fromEntries(
  PAGE_STYLE_PROPERTY_DEFINITIONS.map((property) => [property.key, property]),
) as Record<PageStylePropertyKey, PageStylePropertyDefinition>;

export const PAGE_STYLE_PROPERTY_BY_PAYLOAD_KEY = Object.fromEntries(
  PAGE_STYLE_PROPERTY_DEFINITIONS.map((property) => [property.payloadKey, property]),
) as Record<string, PageStylePropertyDefinition>;

/** CSS declarations use kebab case; React's style prop requires camel case. */
export function pageStyleReactProperty(
  definition: Pick<PageStylePropertyDefinition, 'cssProperty'>,
): string {
  return definition.cssProperty.replace(/-([a-z])/g, (_, character: string) =>
    character.toUpperCase(),
  );
}

/** Shared CSS value guard used before authored styles reach either surface. */
export function isSafePageStyleValue(value: string): boolean {
  return (
    !/[;{}<>`\r\n]/.test(value) &&
    !/(?:url|expression|javascript|vbscript|@import)/i.test(value)
  );
}

export const PAGE_STYLE_PROPERTY_GROUPS = {
  layout: PAGE_STYLE_PROPERTY_DEFINITIONS.filter((property) =>
    [
      'display',
      'flex-direction',
      'justify-content',
      'align-items',
      'flex-wrap',
      'grid-template-columns',
      'position',
    ].includes(property.key),
  ),
  size: PAGE_STYLE_PROPERTY_DEFINITIONS.filter((property) =>
    ['width', 'height', 'min-width', 'max-width', 'min-height', 'max-height'].includes(
      property.key,
    ),
  ),
  spacing: PAGE_STYLE_PROPERTY_DEFINITIONS.filter((property) =>
    ['padding', 'margin', 'gap'].includes(property.key),
  ),
  typography: PAGE_STYLE_PROPERTY_DEFINITIONS.filter((property) =>
    [
      'font-family',
      'color',
      'font-size',
      'font-weight',
      'line-height',
      'letter-spacing',
      'text-align',
      'text-decoration',
    ].includes(property.key),
  ),
  background: PAGE_STYLE_PROPERTY_DEFINITIONS.filter(
    (property) => property.key === 'background-color',
  ),
  border: PAGE_STYLE_PROPERTY_DEFINITIONS.filter((property) =>
    ['border-width', 'border-style', 'border-color', 'border-radius'].includes(
      property.key,
    ),
  ),
  effects: PAGE_STYLE_PROPERTY_DEFINITIONS.filter((property) =>
    ['opacity', 'box-shadow'].includes(property.key),
  ),
} as const;
