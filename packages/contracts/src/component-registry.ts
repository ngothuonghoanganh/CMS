import type { PageNodeV5 } from './index';
import {
  PAGE_STYLE_PROPERTY_DEFINITIONS,
  type PageStylePropertyKey,
} from './style-registry';

export type PageComponentType = PageNodeV5['type'];

export type ComponentPropertyGroup = 'content' | 'style' | 'advanced';

export type ComponentPropertyControl =
  | 'asset'
  | 'color'
  | 'custom'
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
  customEditor?: 'form' | 'list';
  assetKind?: 'image' | 'video';
};

export type ComponentSlotDefinition = {
  name: string;
  label: string;
  accepts: readonly PageComponentType[];
  /** Minimum number of children owned by this semantic slot. */
  minChildren?: number;
  /** Maximum number of children owned by this semantic slot. */
  maxChildren?: number;
  /** Label used by generic structural add actions. */
  addLabel?: string;
  /** Distinguishes semantic structural children from ordinary content. */
  structural?: boolean;
};

export type ComponentBuilderExposure = {
  /** Internal nodes remain selectable/persisted but are not global Add blocks. */
  insertable: boolean;
  keywords: readonly string[];
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
  builder: ComponentBuilderExposure;
  internal: boolean;
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
  heading: [
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
  link: [
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
  divider: [
    'width',
    'height',
    'margin',
    'border-width',
    'border-style',
    'border-color',
    'opacity',
  ],
  list: [
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
  ],
  video: [
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
  ],
  quote: [
    'width',
    'max-width',
    'padding',
    'margin',
    'font-family',
    'color',
    'font-size',
    'font-weight',
    'line-height',
    'letter-spacing',
    'text-align',
    'background-color',
    'border-width',
    'border-style',
    'border-color',
    'border-radius',
    'opacity',
    'box-shadow',
  ],
  accordion: [
    'width',
    'max-width',
    'margin',
    'padding',
    'gap',
    'background-color',
    'border-width',
    'border-style',
    'border-color',
    'border-radius',
    'opacity',
    'box-shadow',
  ],
  'accordion-item': [
    'margin',
    'padding',
    'background-color',
    'border-width',
    'border-style',
    'border-color',
    'border-radius',
  ],
  tabs: [
    'width',
    'max-width',
    'margin',
    'padding',
    'gap',
    'background-color',
    'border-width',
    'border-style',
    'border-color',
    'border-radius',
    'opacity',
    'box-shadow',
  ],
  'tab-item': [
    'padding',
    'background-color',
    'border-width',
    'border-style',
    'border-color',
    'border-radius',
  ],
  gallery: [
    'display',
    'grid-template-columns',
    'gap',
    'width',
    'max-width',
    'margin',
    'padding',
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
  input: Omit<
    PageComponentDefinition,
    'propertiesSchema' | 'slots' | 'migrations' | 'builder' | 'internal'
  > & {
    propertiesSchema?: readonly ComponentPropertyDefinition[];
    slots?: readonly ComponentSlotDefinition[];
    migrations?: readonly ComponentMigrationDefinition[];
    builder?: Partial<ComponentBuilderExposure>;
    internal?: boolean;
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
  builder: {
    insertable: input.builder?.insertable ?? !input.internal,
    keywords: input.builder?.keywords ?? [input.type, input.label],
  },
  internal: input.internal ?? false,
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
      'heading',
      'link',
      'divider',
      'list',
      'video',
      'quote',
      'accordion',
      'tabs',
      'gallery',
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
      'container',
      'text',
      'image',
      'button',
      'form',
      'countdown',
      'extension',
      'heading',
      'link',
      'divider',
      'list',
      'video',
      'quote',
      'accordion',
      'tabs',
      'gallery',
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
      { key: 'text', label: 'Text content', group: 'content', control: 'textarea' },
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
      {
        key: 'src',
        label: 'Image',
        group: 'content',
        control: 'asset',
        assetKind: 'image',
      },
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
        key: 'form',
        label: 'Form fields and messages',
        group: 'content',
        control: 'custom',
        customEditor: 'form',
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
  heading: definition({
    type: 'heading',
    version: 1,
    label: 'Heading',
    category: 'content',
    editorTagName: 'h2',
    defaultProps: { text: 'Heading', level: 2 },
    allowedParents: commonLayoutParents,
    allowedChildren: [],
    propertiesSchema: content([
      { key: 'text', label: 'Text content', group: 'content', control: 'textarea' },
      {
        key: 'level',
        label: 'Heading level',
        group: 'content',
        control: 'select',
        options: [1, 2, 3, 4, 5, 6].map((level) => ({
          label: `H${level}`,
          value: String(level),
        })),
      },
    ]),
  }),
  link: definition({
    type: 'link',
    version: 1,
    label: 'Link',
    category: 'content',
    editorTagName: 'a',
    defaultProps: { text: 'Learn more', href: '/', target: '_self' },
    allowedParents: commonLayoutParents,
    allowedChildren: [],
    propertiesSchema: content([
      { key: 'text', label: 'Text', group: 'content', control: 'text' },
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
  divider: definition({
    type: 'divider',
    version: 1,
    label: 'Divider',
    category: 'content',
    editorTagName: 'hr',
    defaultProps: {},
    allowedParents: commonLayoutParents,
    allowedChildren: [],
    propertiesSchema: [],
  }),
  list: definition({
    type: 'list',
    version: 1,
    label: 'List',
    category: 'content',
    editorTagName: 'ul',
    defaultProps: {
      ordered: false,
      items: [
        { id: 'item-1', text: 'First item' },
        { id: 'item-2', text: 'Second item' },
      ],
    },
    allowedParents: commonLayoutParents,
    allowedChildren: [],
    propertiesSchema: content([
      { key: 'ordered', label: 'Ordered list', group: 'content', control: 'toggle' },
      {
        key: 'items',
        label: 'List items',
        group: 'content',
        control: 'custom',
        customEditor: 'list',
      },
    ]),
  }),
  video: definition({
    type: 'video',
    version: 1,
    label: 'Video',
    category: 'content',
    editorTagName: 'video',
    defaultProps: {
      src: '/assets/placeholder.mp4',
      controls: true,
      autoplay: false,
      muted: false,
      loop: false,
      playsInline: true,
    },
    allowedParents: commonLayoutParents,
    allowedChildren: [],
    propertiesSchema: content([
      {
        key: 'src',
        label: 'Video source',
        group: 'content',
        control: 'asset',
        assetKind: 'video',
      },
      {
        key: 'poster',
        label: 'Poster image',
        group: 'content',
        control: 'asset',
        assetKind: 'image',
      },
      { key: 'controls', label: 'Show controls', group: 'content', control: 'toggle' },
      { key: 'autoplay', label: 'Autoplay', group: 'content', control: 'toggle' },
      { key: 'muted', label: 'Muted', group: 'content', control: 'toggle' },
      { key: 'loop', label: 'Loop', group: 'content', control: 'toggle' },
      { key: 'playsInline', label: 'Play inline', group: 'content', control: 'toggle' },
    ]),
  }),
  quote: definition({
    type: 'quote',
    version: 1,
    label: 'Quote',
    category: 'content',
    editorTagName: 'blockquote',
    defaultProps: { text: 'A thoughtful quote', cite: '' },
    allowedParents: commonLayoutParents.concat(['accordion-item', 'tab-item']),
    allowedChildren: [],
    propertiesSchema: content([
      { key: 'text', label: 'Quote', group: 'content', control: 'textarea' },
      { key: 'cite', label: 'Citation', group: 'content', control: 'text' },
    ]),
  }),
  accordion: definition({
    type: 'accordion',
    version: 1,
    label: 'Accordion',
    category: 'content',
    editorTagName: 'div',
    defaultProps: { allowMultiple: false },
    allowedParents: commonLayoutParents,
    allowedChildren: ['accordion-item'],
    slots: [
      {
        name: 'items',
        label: 'Accordion items',
        accepts: ['accordion-item'],
        minChildren: 1,
        maxChildren: 20,
        addLabel: 'Add Accordion Item',
        structural: true,
      },
    ],
    propertiesSchema: content([
      {
        key: 'allowMultiple',
        label: 'Allow multiple open',
        group: 'content',
        control: 'toggle',
      },
    ]),
  }),
  'accordion-item': definition({
    type: 'accordion-item',
    version: 1,
    label: 'Accordion Item',
    category: 'content',
    editorTagName: 'section',
    defaultProps: { title: 'Accordion item', defaultOpen: false },
    allowedParents: ['accordion'],
    allowedChildren: [
      'container',
      'text',
      'heading',
      'image',
      'button',
      'link',
      'divider',
      'list',
      'video',
      'form',
      'countdown',
      'extension',
      'quote',
    ],
    propertiesSchema: content([
      { key: 'title', label: 'Title', group: 'content', control: 'text' },
      {
        key: 'defaultOpen',
        label: 'Open by default',
        group: 'content',
        control: 'toggle',
      },
    ]),
    internal: true,
  }),
  tabs: definition({
    type: 'tabs',
    version: 1,
    label: 'Tabs',
    category: 'content',
    editorTagName: 'div',
    defaultProps: { orientation: 'horizontal' },
    allowedParents: commonLayoutParents,
    allowedChildren: ['tab-item'],
    slots: [
      {
        name: 'items',
        label: 'Tabs',
        accepts: ['tab-item'],
        minChildren: 1,
        maxChildren: 20,
        addLabel: 'Add Tab',
        structural: true,
      },
    ],
    propertiesSchema: content([
      {
        key: 'orientation',
        label: 'Orientation',
        group: 'content',
        control: 'select',
        options: [
          { value: 'horizontal', label: 'Horizontal' },
          { value: 'vertical', label: 'Vertical' },
        ],
      },
    ]),
  }),
  'tab-item': definition({
    type: 'tab-item',
    version: 1,
    label: 'Tab Item',
    category: 'content',
    editorTagName: 'section',
    defaultProps: { label: 'Tab' },
    allowedParents: ['tabs'],
    allowedChildren: [
      'container',
      'text',
      'heading',
      'image',
      'button',
      'link',
      'divider',
      'list',
      'video',
      'form',
      'countdown',
      'extension',
      'quote',
    ],
    propertiesSchema: content([
      { key: 'label', label: 'Tab label', group: 'content', control: 'text' },
    ]),
    internal: true,
  }),
  gallery: definition({
    type: 'gallery',
    version: 1,
    label: 'Gallery',
    category: 'content',
    editorTagName: 'div',
    defaultProps: {},
    allowedParents: commonLayoutParents,
    allowedChildren: ['image'],
    slots: [
      {
        name: 'images',
        label: 'Gallery images',
        accepts: ['image'],
        minChildren: 1,
        maxChildren: 50,
        addLabel: 'Add Image',
        structural: true,
      },
    ],
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
  return Boolean(findAcceptingSlot(parentType, childType));
}

export function findAcceptingSlot(
  parentType: PageComponentType,
  childType: PageComponentType,
  currentChildCount = 0,
): ComponentSlotDefinition | undefined {
  return PAGE_COMPONENT_REGISTRY[parentType].slots.find(
    (slot) =>
      slot.accepts.includes(childType) &&
      (slot.maxChildren === undefined || currentChildCount < slot.maxChildren),
  );
}

export function canInsertChild(
  parentType: PageComponentType,
  childType: PageComponentType,
  currentChildCount = 0,
): boolean {
  return Boolean(findAcceptingSlot(parentType, childType, currentChildCount));
}

export function canRemoveChild(
  parentType: PageComponentType,
  childType: PageComponentType,
  currentChildCount: number,
): boolean {
  const slot = PAGE_COMPONENT_REGISTRY[parentType].slots.find((candidate) =>
    candidate.accepts.includes(childType),
  );
  if (!slot) return false;
  return slot.minChildren === undefined || currentChildCount - 1 >= slot.minChildren;
}

export function canDuplicateChild(
  parentType: PageComponentType,
  childType: PageComponentType,
  currentChildCount: number,
): boolean {
  return canInsertChild(parentType, childType, currentChildCount);
}

export { PAGE_STYLE_PROPERTY_GROUPS } from './style-registry';
