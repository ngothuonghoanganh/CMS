import type { PageNodeV3 } from './index';

export type PageComponentType = PageNodeV3['type'];

export type ComponentPropertyGroup = 'content' | 'style' | 'advanced';

export type ComponentPropertyControl =
  | 'asset'
  | 'color'
  | 'datetime'
  | 'number'
  | 'segmented'
  | 'select'
  | 'spacing'
  | 'text'
  | 'textarea'
  | 'toggle'
  | 'unit'
  | 'url';

export type ComponentPropertyOption = {
  label: string;
  value: string;
};

export type ComponentPropertyDefinition = {
  key: string;
  label: string;
  group: ComponentPropertyGroup;
  control: ComponentPropertyControl;
  description?: string;
  responsive?: boolean;
  allowAuto?: boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: readonly ComponentPropertyOption[];
};

export type ComponentSlotDefinition = {
  name: string;
  label: string;
  accepts: readonly PageComponentType[];
};

export type ComponentMigrationDefinition = {
  id: string;
  fromVersion: number;
  toVersion: number;
};

export type PageComponentDefinition = {
  type: PageComponentType;
  version: number;
  label: string;
  category: 'layout' | 'content' | 'conversion' | 'extension';
  editorTagName: string;
  defaultProps: Readonly<Record<string, unknown>>;
  allowedParents: readonly PageComponentType[];
  allowedChildren: readonly PageComponentType[];
  slots: readonly ComponentSlotDefinition[];
  migrations: readonly ComponentMigrationDefinition[];
  propertiesSchema: readonly ComponentPropertyDefinition[];
};

const responsiveStyleProperties: readonly ComponentPropertyDefinition[] = [
  {
    key: 'display',
    label: 'Display',
    group: 'style',
    control: 'select',
    responsive: true,
    options: [
      { value: '', label: 'Default' },
      { value: 'block', label: 'Block' },
      { value: 'flex', label: 'Flex' },
      { value: 'grid', label: 'Grid' },
      { value: 'inline', label: 'Inline' },
      { value: 'inline-block', label: 'Inline block' },
      { value: 'none', label: 'Hidden' },
    ],
  },
  {
    key: 'width',
    label: 'Width',
    group: 'style',
    control: 'unit',
    responsive: true,
    allowAuto: true,
  },
  {
    key: 'max-width',
    label: 'Max width',
    group: 'style',
    control: 'unit',
    responsive: true,
  },
  {
    key: 'min-height',
    label: 'Min height',
    group: 'style',
    control: 'unit',
    responsive: true,
  },
  {
    key: 'gap',
    label: 'Gap',
    group: 'style',
    control: 'unit',
    responsive: true,
    allowAuto: true,
  },
  {
    key: 'padding',
    label: 'Padding',
    group: 'style',
    control: 'spacing',
    responsive: true,
  },
  {
    key: 'margin',
    label: 'Margin',
    group: 'style',
    control: 'spacing',
    responsive: true,
    allowAuto: true,
  },
  {
    key: 'color',
    label: 'Text color',
    group: 'style',
    control: 'color',
    responsive: true,
  },
  {
    key: 'font-size',
    label: 'Font size',
    group: 'style',
    control: 'unit',
    responsive: true,
  },
  {
    key: 'font-weight',
    label: 'Font weight',
    group: 'style',
    control: 'select',
    responsive: true,
    options: [
      { value: '', label: 'Default' },
      { value: '400', label: 'Regular (400)' },
      { value: '500', label: 'Medium (500)' },
      { value: '600', label: 'Semibold (600)' },
      { value: '700', label: 'Bold (700)' },
      { value: '800', label: 'Extra bold (800)' },
    ],
  },
  {
    key: 'text-align',
    label: 'Text alignment',
    group: 'style',
    control: 'segmented',
    responsive: true,
    options: [
      { value: 'left', label: 'Left' },
      { value: 'center', label: 'Center' },
      { value: 'right', label: 'Right' },
    ],
  },
  {
    key: 'background-color',
    label: 'Background',
    group: 'style',
    control: 'color',
    responsive: true,
  },
  {
    key: 'border-radius',
    label: 'Radius',
    group: 'style',
    control: 'unit',
    responsive: true,
  },
];

const layoutProperties = responsiveStyleProperties.filter(
  (property) =>
    property.key === 'display' ||
    property.key === 'width' ||
    property.key === 'max-width' ||
    property.key === 'min-height' ||
    property.key === 'gap',
);
const spacingProperties = responsiveStyleProperties.filter(
  (property) => property.key === 'padding' || property.key === 'margin',
);
const typographyProperties = responsiveStyleProperties.filter(
  (property) =>
    property.key === 'color' ||
    property.key === 'font-size' ||
    property.key === 'font-weight' ||
    property.key === 'text-align',
);
const appearanceProperties = responsiveStyleProperties.filter(
  (property) => property.key === 'background-color' || property.key === 'border-radius',
);

const styleSchemaFor = (
  type: PageComponentType,
): readonly ComponentPropertyDefinition[] => {
  const properties = [...responsiveStyleProperties];
  if (!['root', 'section', 'container'].includes(type)) {
    return properties.filter((property) => property.key !== 'gap');
  }
  return properties;
};

const content = (
  properties: readonly ComponentPropertyDefinition[],
): readonly ComponentPropertyDefinition[] => properties;

const definition = (
  input: Omit<PageComponentDefinition, 'propertiesSchema' | 'slots' | 'migrations'> & {
    propertiesSchema?: readonly ComponentPropertyDefinition[];
    slots?: readonly ComponentSlotDefinition[];
    migrations?: readonly ComponentMigrationDefinition[];
  },
): PageComponentDefinition => ({
  ...input,
  slots:
    input.slots ??
    (input.allowedChildren.length > 0
      ? [{ name: 'children', label: 'Content', accepts: input.allowedChildren }]
      : []),
  migrations: input.migrations ?? [],
  propertiesSchema: [...(input.propertiesSchema ?? []), ...styleSchemaFor(input.type)],
});

const commonLayoutParents: readonly PageComponentType[] = [
  'root',
  'section',
  'container',
];

export const PAGE_COMPONENT_REGISTRY = {
  root: definition({
    type: 'root',
    version: 1,
    label: 'Page root',
    category: 'layout',
    editorTagName: 'main',
    defaultProps: {},
    allowedParents: [],
    allowedChildren: ['section', 'container'],
  }),
  section: definition({
    type: 'section',
    version: 1,
    label: 'Section',
    category: 'layout',
    editorTagName: 'section',
    defaultProps: {},
    allowedParents: ['root', 'section', 'container'],
    allowedChildren: [
      'container',
      'text',
      'image',
      'button',
      'form',
      'countdown',
      'extension',
    ],
  }),
  container: definition({
    type: 'container',
    version: 1,
    label: 'Container',
    category: 'layout',
    editorTagName: 'div',
    defaultProps: {},
    allowedParents: ['root', 'section', 'container'],
    allowedChildren: [
      'section',
      'text',
      'image',
      'button',
      'form',
      'countdown',
      'extension',
    ],
  }),
  text: definition({
    type: 'text',
    version: 1,
    label: 'Text',
    category: 'content',
    editorTagName: 'p',
    defaultProps: { text: 'Edit this text', align: 'left' },
    allowedParents: commonLayoutParents,
    allowedChildren: [],
    propertiesSchema: content([
      { key: 'text', label: 'Text', group: 'content', control: 'textarea' },
      {
        key: 'align',
        label: 'Alignment',
        group: 'content',
        control: 'segmented',
        options: [
          { value: 'left', label: 'Left' },
          { value: 'center', label: 'Center' },
          { value: 'right', label: 'Right' },
        ],
      },
    ]),
  }),
  image: definition({
    type: 'image',
    version: 1,
    label: 'Image',
    category: 'content',
    editorTagName: 'img',
    defaultProps: { src: '/assets/placeholder.png', alt: 'Image' },
    allowedParents: commonLayoutParents,
    allowedChildren: [],
    propertiesSchema: content([
      { key: 'src', label: 'Image', group: 'content', control: 'asset' },
      { key: 'alt', label: 'Alt text', group: 'content', control: 'text' },
    ]),
  }),
  button: definition({
    type: 'button',
    version: 1,
    label: 'Button',
    category: 'conversion',
    editorTagName: 'a',
    defaultProps: { label: 'Button', href: '#section', target: '_self' },
    allowedParents: commonLayoutParents,
    allowedChildren: [],
    propertiesSchema: content([
      { key: 'label', label: 'Label', group: 'content', control: 'text' },
      { key: 'href', label: 'Link', group: 'content', control: 'url' },
      {
        key: 'target',
        label: 'Open link',
        group: 'content',
        control: 'select',
        options: [
          { value: '_self', label: 'Same tab' },
          { value: '_blank', label: 'New tab' },
        ],
      },
    ]),
  }),
  form: definition({
    type: 'form',
    version: 1,
    label: 'Form',
    category: 'conversion',
    editorTagName: 'form',
    defaultProps: {},
    allowedParents: commonLayoutParents,
    allowedChildren: [],
    propertiesSchema: content([
      {
        key: 'submitLabel',
        label: 'Submit button label',
        group: 'content',
        control: 'text',
      },
      {
        key: 'successMessage',
        label: 'Success message',
        group: 'content',
        control: 'textarea',
      },
    ]),
  }),
  countdown: definition({
    type: 'countdown',
    version: 1,
    label: 'Countdown',
    category: 'extension',
    editorTagName: 'div',
    defaultProps: {},
    allowedParents: commonLayoutParents,
    allowedChildren: [],
    propertiesSchema: content([
      { key: 'label', label: 'Countdown label', group: 'content', control: 'text' },
      {
        key: 'targetAt',
        label: 'Target date and time',
        group: 'content',
        control: 'datetime',
      },
    ]),
  }),
  extension: definition({
    type: 'extension',
    version: 1,
    label: 'Custom extension',
    category: 'extension',
    editorTagName: 'div',
    defaultProps: {},
    allowedParents: commonLayoutParents,
    allowedChildren: [],
    propertiesSchema: [],
  }),
} satisfies Record<PageComponentType, PageComponentDefinition>;

export type PageComponentRegistry = typeof PAGE_COMPONENT_REGISTRY;

export function getPageComponentDefinition(
  type: PageComponentType,
): PageComponentDefinition {
  return PAGE_COMPONENT_REGISTRY[type];
}

export function isPageComponentType(value: unknown): value is PageComponentType {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(PAGE_COMPONENT_REGISTRY, value)
  );
}

export function canContainPageComponent(
  parentType: PageComponentType,
  childType: PageComponentType,
): boolean {
  return PAGE_COMPONENT_REGISTRY[parentType].allowedChildren.includes(childType);
}

export const PAGE_STYLE_PROPERTY_GROUPS = {
  layout: layoutProperties,
  spacing: spacingProperties,
  typography: typographyProperties,
  appearance: appearanceProperties,
} as const;
