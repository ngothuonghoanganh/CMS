import type { PageNodeV3 } from './index';
import {
  PAGE_STYLE_PROPERTY_DEFINITIONS,
  type PageStylePropertyKey,
} from './style-registry';

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

const responsiveStyleProperties: readonly ComponentPropertyDefinition[] =
  PAGE_STYLE_PROPERTY_DEFINITIONS;

/**
 * Component style capabilities are deliberately explicit.  The registry is
 * the only source used by the Inspector to decide which visual properties a
 * component can expose; this prevents a new component from accidentally
 * inheriting every CSS control in the vocabulary.
 */
export const PAGE_COMPONENT_STYLE_CAPABILITIES: Readonly<
  Record<PageComponentType, readonly PageStylePropertyKey[]>
> = {
  root: [
    'display',
    'flex-direction',
    'justify-content',
    'align-items',
    'flex-wrap',
    'grid-template-columns',
    'position',
    'width',
    'height',
    'min-width',
    'max-width',
    'min-height',
    'max-height',
    'padding',
    'margin',
    'gap',
    'background-color',
  ],
  section: [
    'display',
    'flex-direction',
    'justify-content',
    'align-items',
    'flex-wrap',
    'grid-template-columns',
    'position',
    'width',
    'height',
    'min-width',
    'max-width',
    'min-height',
    'max-height',
    'padding',
    'margin',
    'gap',
    'background-color',
    'border-width',
    'border-style',
    'border-color',
    'border-radius',
    'opacity',
    'box-shadow',
  ],
  container: [
    'display',
    'flex-direction',
    'justify-content',
    'align-items',
    'flex-wrap',
    'grid-template-columns',
    'position',
    'width',
    'height',
    'min-width',
    'max-width',
    'min-height',
    'max-height',
    'padding',
    'margin',
    'gap',
    'background-color',
    'border-width',
    'border-style',
    'border-color',
    'border-radius',
    'opacity',
    'box-shadow',
  ],
  text: [
    'width',
    'height',
    'min-width',
    'max-width',
    'min-height',
    'max-height',
    'padding',
    'margin',
    'font-family',
    'color',
    'font-size',
    'font-weight',
    'line-height',
    'letter-spacing',
    'text-align',
    'text-decoration',
    'background-color',
    'border-width',
    'border-style',
    'border-color',
    'border-radius',
    'opacity',
    'box-shadow',
  ],
  image: [
    'width',
    'height',
    'min-width',
    'max-width',
    'min-height',
    'max-height',
    'padding',
    'margin',
    'border-width',
    'border-style',
    'border-color',
    'border-radius',
    'opacity',
    'box-shadow',
  ],
  button: [
    'width',
    'height',
    'min-width',
    'max-width',
    'min-height',
    'max-height',
    'padding',
    'margin',
    'font-family',
    'color',
    'font-size',
    'font-weight',
    'line-height',
    'letter-spacing',
    'text-align',
    'text-decoration',
    'background-color',
    'border-width',
    'border-style',
    'border-color',
    'border-radius',
    'opacity',
    'box-shadow',
  ],
  form: [
    'width',
    'height',
    'min-width',
    'max-width',
    'min-height',
    'max-height',
    'padding',
    'margin',
    'background-color',
    'border-width',
    'border-style',
    'border-color',
    'border-radius',
    'opacity',
    'box-shadow',
  ],
  countdown: [
    'width',
    'height',
    'min-width',
    'max-width',
    'min-height',
    'max-height',
    'padding',
    'margin',
    'font-family',
    'color',
    'font-size',
    'font-weight',
    'line-height',
    'letter-spacing',
    'text-align',
    'text-decoration',
    'background-color',
    'border-width',
    'border-style',
    'border-color',
    'border-radius',
    'opacity',
    'box-shadow',
  ],
  extension: [
    'width',
    'height',
    'min-width',
    'max-width',
    'min-height',
    'max-height',
    'padding',
    'margin',
    'background-color',
    'opacity',
    'box-shadow',
  ],
};

export const styleSchemaFor = (
  type: PageComponentType,
): readonly ComponentPropertyDefinition[] => {
  const capabilities = new Set(PAGE_COMPONENT_STYLE_CAPABILITIES[type]);
  return responsiveStyleProperties.filter((property) =>
    capabilities.has(property.key as PageStylePropertyKey),
  );
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
    // `props.align` remains in the payload schema as a legacy compatibility
    // fallback, but newly-created text nodes write visual alignment to style.
    defaultProps: { text: 'Edit this text' },
    allowedParents: commonLayoutParents,
    allowedChildren: [],
    propertiesSchema: content([
      { key: 'text', label: 'Text', group: 'content', control: 'textarea' },
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

export { PAGE_STYLE_PROPERTY_GROUPS } from './style-registry';
