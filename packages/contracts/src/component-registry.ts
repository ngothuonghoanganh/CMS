import type { PageNodeV6 } from './index';
import {
  PAGE_STYLE_PROPERTY_DEFINITIONS,
  type PageStylePropertyKey,
} from './style-registry';

export type PageComponentType = PageNodeV6['type'];

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
  group: 'layout' | 'typography' | 'media' | 'interactive' | 'conversion' | 'advanced';
  keywords: readonly string[];
  description?: string;
};

export type ComponentPartDefinition = {
  name: string;
  label: string;
  styleCapabilities: readonly PageStylePropertyKey[];
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
  componentParts: Readonly<Record<string, ComponentPartDefinition>>;
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
    | 'propertiesSchema'
    | 'allowedParents'
    | 'allowedChildren'
    | 'slots'
    | 'componentParts'
    | 'migrations'
    | 'builder'
    | 'internal'
  > & {
    propertiesSchema?: readonly ComponentPropertyDefinition[];
    slots?: readonly ComponentSlotDefinition[];
    componentParts?: Readonly<Record<string, ComponentPartDefinition>>;
    migrations?: readonly ComponentMigrationDefinition[];
    builder?: Partial<ComponentBuilderExposure>;
    internal?: boolean;
  },
): Omit<PageComponentDefinition, 'allowedParents'> & {
  allowedParents: readonly PageComponentType[];
} => {
  const slots = input.slots ?? [];
  const allowedChildren = [...new Set(slots.flatMap((slot) => slot.accepts))];
  const categoryToGroup: Record<
    PageComponentDefinition['category'],
    ComponentBuilderExposure['group']
  > = {
    layout: 'layout',
    content: 'typography',
    conversion: 'conversion',
    extension: 'advanced',
  };
  return {
    ...input,
    allowedParents: [],
    allowedChildren,
    slots,
    componentParts: input.componentParts ?? {},
    migrations: input.migrations ?? [],
    propertiesSchema: [...(input.propertiesSchema ?? []), ...styleSchemaFor(input.type)],
    builder: {
      insertable: input.builder?.insertable ?? !input.internal,
      group: input.builder?.group ?? categoryToGroup[input.category],
      keywords: input.builder?.keywords ?? [input.type, input.label],
      ...(input.builder?.description ? { description: input.builder.description } : {}),
    },
    internal: input.internal ?? false,
  };
};

const rawPageComponentRegistry = {
  root: definition({
    type: 'root',
    version: 1,
    label: 'Page root',
    category: 'layout',
    editorTagName: 'main',
    defaultProps: {},
    slots: [
      { name: 'children', label: 'Page content', accepts: ['section', 'container'] },
    ],
  }),
  section: definition({
    type: 'section',
    version: 1,
    label: 'Section',
    category: 'layout',
    editorTagName: 'section',
    defaultProps: {},
    slots: [
      {
        name: 'children',
        label: 'Section content',
        accepts: [
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
      },
    ],
  }),
  container: definition({
    type: 'container',
    version: 1,
    label: 'Container',
    category: 'layout',
    editorTagName: 'div',
    defaultProps: {},
    slots: [
      {
        name: 'children',
        label: 'Container content',
        accepts: [
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
      },
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
    builder: { group: 'media' },
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
    propertiesSchema: [],
  }),
  heading: definition({
    type: 'heading',
    version: 1,
    label: 'Heading',
    category: 'content',
    editorTagName: 'h2',
    defaultProps: { text: 'Heading', level: 2 },
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
    builder: { group: 'media' },
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
    slots: [],
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
    builder: { group: 'interactive' },
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
    componentParts: {
      root: {
        name: 'root',
        label: 'Root',
        styleCapabilities: [
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
      },
      item: {
        name: 'item',
        label: 'Item',
        styleCapabilities: [
          'margin',
          'padding',
          'background-color',
          'border-width',
          'border-style',
          'border-color',
          'border-radius',
        ],
      },
      trigger: {
        name: 'trigger',
        label: 'Trigger',
        styleCapabilities: [
          'padding',
          'background-color',
          'color',
          'font-family',
          'font-size',
          'font-weight',
          'line-height',
          'border-width',
          'border-style',
          'border-color',
          'border-radius',
        ],
      },
      panel: {
        name: 'panel',
        label: 'Panel',
        styleCapabilities: [
          'padding',
          'background-color',
          'color',
          'font-family',
          'font-size',
          'line-height',
          'border-width',
          'border-style',
          'border-color',
          'border-radius',
        ],
      },
      icon: {
        name: 'icon',
        label: 'Icon',
        styleCapabilities: ['color', 'font-size', 'width', 'height', 'margin'],
      },
    },
    propertiesSchema: content([
      {
        key: 'allowMultiple',
        label: 'Allow multiple open',
        group: 'content',
        control: 'toggle',
      },
      {
        key: 'headingLevel',
        label: 'Heading level',
        group: 'content',
        control: 'select',
        options: [2, 3, 4, 5, 6].map((level) => ({
          label: `H${level}`,
          value: String(level),
        })),
      },
      { key: 'ariaLabel', label: 'Accessible label', group: 'content', control: 'text' },
    ]),
  }),
  'accordion-item': definition({
    type: 'accordion-item',
    version: 1,
    label: 'Accordion Item',
    category: 'content',
    editorTagName: 'section',
    defaultProps: { title: 'Accordion item', defaultOpen: false },
    slots: [
      {
        name: 'content',
        label: 'Item content',
        accepts: [
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
      },
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
    builder: { group: 'interactive' },
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
    componentParts: {
      root: {
        name: 'root',
        label: 'Root',
        styleCapabilities: [
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
      },
      list: {
        name: 'list',
        label: 'Tab list',
        styleCapabilities: [
          'display',
          'gap',
          'padding',
          'margin',
          'background-color',
          'border-width',
          'border-style',
          'border-color',
          'border-radius',
        ],
      },
      tab: {
        name: 'tab',
        label: 'Tab',
        styleCapabilities: [
          'padding',
          'margin',
          'background-color',
          'color',
          'font-family',
          'font-size',
          'font-weight',
          'line-height',
          'border-width',
          'border-style',
          'border-color',
          'border-radius',
        ],
      },
      activeTab: {
        name: 'activeTab',
        label: 'Active tab',
        styleCapabilities: [
          'padding',
          'margin',
          'background-color',
          'color',
          'font-family',
          'font-size',
          'font-weight',
          'line-height',
          'border-width',
          'border-style',
          'border-color',
          'border-radius',
        ],
      },
      panel: {
        name: 'panel',
        label: 'Panel',
        styleCapabilities: [
          'padding',
          'margin',
          'background-color',
          'color',
          'font-family',
          'font-size',
          'line-height',
          'border-width',
          'border-style',
          'border-color',
          'border-radius',
        ],
      },
    },
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
      { key: 'ariaLabel', label: 'Accessible label', group: 'content', control: 'text' },
      {
        key: 'activationMode',
        label: 'Activation',
        group: 'content',
        control: 'select',
        options: [
          { value: 'automatic', label: 'Automatic' },
          { value: 'manual', label: 'Manual' },
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
    slots: [
      {
        name: 'content',
        label: 'Tab content',
        accepts: [
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
      },
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
    builder: { group: 'media' },
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

function deriveAllowedParents(
  registry: typeof rawPageComponentRegistry,
): Record<PageComponentType, readonly PageComponentType[]> {
  return Object.fromEntries(
    Object.keys(registry).map((childType) => [
      childType,
      Object.entries(registry)
        .filter(([, parent]) =>
          parent.slots.some((slot) =>
            slot.accepts.includes(childType as PageComponentType),
          ),
        )
        .map(([parentType]) => parentType as PageComponentType),
    ]),
  ) as unknown as Record<PageComponentType, readonly PageComponentType[]>;
}

const derivedParents = deriveAllowedParents(rawPageComponentRegistry);

export const PAGE_COMPONENT_REGISTRY = Object.fromEntries(
  Object.entries(rawPageComponentRegistry).map(([type, component]) => [
    type,
    { ...component, allowedParents: derivedParents[type as PageComponentType] },
  ]),
) as { [K in PageComponentType]: PageComponentDefinition };

export type ComponentSlotOccupancy = {
  count: number;
  bySlot?: Record<string, number>;
};

export type StructuralSlotRegistry = Readonly<
  Record<string, { slots: readonly ComponentSlotDefinition[] }>
>;

/**
 * Test-only fixture for proving that a child type accepted by two slots cannot
 * be placed through an implicit command. It deliberately does not belong to
 * PAGE_COMPONENT_REGISTRY or the public builder palette.
 */
export const MULTI_SLOT_TEST_COMPONENT_DEFINITION = {
  type: 'multi-slot-test',
  slots: [
    {
      name: 'primary',
      label: 'Primary content',
      accepts: ['text', 'image'] as const,
      maxChildren: 1,
      structural: true,
    },
    {
      name: 'secondary',
      label: 'Secondary content',
      accepts: ['text', 'image'] as const,
      maxChildren: 1,
      structural: true,
    },
  ],
} as const;

export const MULTI_SLOT_TEST_REGISTRY: StructuralSlotRegistry = {
  [MULTI_SLOT_TEST_COMPONENT_DEFINITION.type]: MULTI_SLOT_TEST_COMPONENT_DEFINITION,
};

type SlotChild = { type: PageComponentType; slot?: string };

function slotFor(
  parentType: PageComponentType,
  slotName: string,
): ComponentSlotDefinition | undefined {
  return PAGE_COMPONENT_REGISTRY[parentType].slots.find((slot) => slot.name === slotName);
}

function occupancyCount(
  occupancy: ComponentSlotOccupancy | number | undefined,
  slotName?: string,
): number {
  if (typeof occupancy === 'number') return Math.max(0, occupancy);
  if (!occupancy) return 0;
  if (occupancy.bySlot && slotName !== undefined) {
    return Math.max(0, occupancy.bySlot[slotName] ?? 0);
  }
  return Math.max(0, occupancy.count);
}

export function getSlotChildren(
  parent: { children?: readonly SlotChild[] },
  slotName: string,
): readonly SlotChild[] {
  const parentType = (parent as { type?: PageComponentType }).type;
  const slot = parentType ? slotFor(parentType, slotName) : undefined;
  return slot
    ? (parent.children ?? []).filter((child) =>
        child.slot ? child.slot === slotName : slot.accepts.includes(child.type),
      )
    : [];
}

export function getSlotOccupancy(
  parent: { type?: PageComponentType; children?: readonly SlotChild[] },
  slotName: string,
): ComponentSlotOccupancy {
  const children = getSlotChildren(parent, slotName);
  return { count: children.length, bySlot: { [slotName]: children.length } };
}

export function resolveSlotsForChild(
  parentType: PageComponentType,
  childType: PageComponentType,
): readonly ComponentSlotDefinition[] {
  return PAGE_COMPONENT_REGISTRY[parentType].slots.filter((slot) =>
    slot.accepts.includes(childType),
  );
}

export function resolveSlotForChild(
  parentType: PageComponentType,
  childType: PageComponentType,
  occupancy?: ComponentSlotOccupancy | number,
): ComponentSlotDefinition | undefined {
  const slots = resolveSlotsForChild(parentType, childType);
  // Implicit placement is safe only when the registry gives us exactly one
  // semantic destination. Callers must name the slot for ambiguous fixtures.
  if (slots.length !== 1) return undefined;
  return slots.find(
    (slot) =>
      slot.maxChildren === undefined ||
      occupancyCount(occupancy, slot.name) < slot.maxChildren,
  );
}

export function createStructuralSlotEngine(registry: StructuralSlotRegistry) {
  function definitionFor(parentType: string) {
    return registry[parentType];
  }

  function resolveSlotsForRegistry(
    parentType: string,
    childType: PageComponentType,
  ): readonly ComponentSlotDefinition[] {
    return (
      definitionFor(parentType)?.slots.filter((slot) =>
        slot.accepts.includes(childType),
      ) ?? []
    );
  }

  function resolveSlotForRegistry(
    parentType: string,
    childType: PageComponentType,
    occupancy?: ComponentSlotOccupancy | number,
  ): ComponentSlotDefinition | undefined {
    const slots = resolveSlotsForRegistry(parentType, childType);
    if (slots.length !== 1) return undefined;
    const slot = slots[0];
    return slot &&
      (slot.maxChildren === undefined ||
        occupancyCount(occupancy, slot.name) < slot.maxChildren)
      ? slot
      : undefined;
  }

  function occupancyFor(
    parent: { type: string; children?: readonly SlotChild[] },
    slot: ComponentSlotDefinition,
  ): ComponentSlotOccupancy {
    const count = (parent.children ?? []).filter((child) =>
      child.slot ? child.slot === slot.name : slot.accepts.includes(child.type),
    ).length;
    return { count, bySlot: { [slot.name]: count } };
  }

  return {
    getSlotOccupancy: (
      parent: { type: string; children?: readonly SlotChild[] },
      slotName: string,
    ): ComponentSlotOccupancy => {
      const slot = definitionFor(parent.type)?.slots.find(
        (candidate) => candidate.name === slotName,
      );
      return slot ? occupancyFor(parent, slot) : { count: 0, bySlot: { [slotName]: 0 } };
    },
    resolveSlotsForChild: resolveSlotsForRegistry,
    resolveSlotForChild: resolveSlotForRegistry,
    canInsertIntoSlot: (args: {
      parentType: string;
      slotName: string;
      childType: PageComponentType;
      occupancy: ComponentSlotOccupancy | number;
    }): boolean => {
      const slot = definitionFor(args.parentType)?.slots.find(
        (candidate) => candidate.name === args.slotName,
      );
      return Boolean(
        slot &&
        slot.accepts.includes(args.childType) &&
        (slot.maxChildren === undefined ||
          occupancyCount(args.occupancy, slot.name) < slot.maxChildren),
      );
    },
    canRemoveFromSlot: (args: {
      parentType: string;
      slotName: string;
      childType: PageComponentType;
      occupancy: ComponentSlotOccupancy | number;
    }): boolean => {
      const slot = definitionFor(args.parentType)?.slots.find(
        (candidate) => candidate.name === args.slotName,
      );
      return Boolean(
        slot &&
        slot.accepts.includes(args.childType) &&
        (slot.minChildren === undefined ||
          occupancyCount(args.occupancy, slot.name) - 1 >= slot.minChildren),
      );
    },
  };
}

export function canInsertIntoSlot({
  parentType,
  slotName,
  childType,
  occupancy,
}: {
  parentType: PageComponentType;
  slotName: string;
  childType: PageComponentType;
  occupancy: ComponentSlotOccupancy | number;
}): boolean {
  const slot = slotFor(parentType, slotName);
  return Boolean(
    slot &&
    slot.accepts.includes(childType) &&
    (slot.maxChildren === undefined ||
      occupancyCount(occupancy, slot.name) < slot.maxChildren),
  );
}

export function canRemoveFromSlot({
  parentType,
  slotName,
  childType,
  occupancy,
}: {
  parentType: PageComponentType;
  slotName: string;
  childType: PageComponentType;
  occupancy: ComponentSlotOccupancy | number;
}): boolean {
  const slot = slotFor(parentType, slotName);
  return Boolean(
    slot &&
    slot.accepts.includes(childType) &&
    (slot.minChildren === undefined ||
      occupancyCount(occupancy, slot.name) - 1 >= slot.minChildren),
  );
}

export function canDuplicateInSlot(args: {
  parentType: PageComponentType;
  slotName: string;
  childType: PageComponentType;
  occupancy: ComponentSlotOccupancy | number;
}): boolean {
  return canInsertIntoSlot(args);
}

export function allowedChildrenFor(
  type: PageComponentType,
): readonly PageComponentType[] {
  return [
    ...new Set(PAGE_COMPONENT_REGISTRY[type].slots.flatMap((slot) => slot.accepts)),
  ];
}

export function allowedParentsFor(type: PageComponentType): readonly PageComponentType[] {
  return PAGE_COMPONENT_REGISTRY[type].allowedParents;
}

export function assertStructuralSlotRegistry(registry: StructuralSlotRegistry): void {
  for (const [parentType, definition] of Object.entries(registry)) {
    const seenSlotNames = new Set<string>();
    const seenChildTypes = new Set<PageComponentType>();
    for (const slot of definition.slots) {
      if (seenSlotNames.has(slot.name)) {
        throw new Error(`Duplicate slot ${parentType}.${slot.name}`);
      }
      seenSlotNames.add(slot.name);
      for (const childType of slot.accepts) {
        if (seenChildTypes.has(childType)) {
          throw new Error(
            `Ambiguous child placement: ${parentType} accepts ${childType} in multiple slots`,
          );
        }
        seenChildTypes.add(childType);
      }
    }
  }
}

export function assertPageComponentRegistry(
  registry: Record<PageComponentType, PageComponentDefinition> = PAGE_COMPONENT_REGISTRY,
): void {
  assertStructuralSlotRegistry(registry);
  for (const [parentType, definition] of Object.entries(registry) as Array<
    [PageComponentType, PageComponentDefinition]
  >) {
    const seenChildTypes = new Set<PageComponentType>();
    const seenSlotNames = new Set<string>();
    for (const slot of definition.slots) {
      if (seenSlotNames.has(slot.name))
        throw new Error(`Duplicate slot ${parentType}.${slot.name}`);
      seenSlotNames.add(slot.name);
      for (const childType of slot.accepts) {
        if (!registry[childType]) throw new Error(`Unknown child type ${childType}`);
        if (seenChildTypes.has(childType)) {
          throw new Error(
            `Ambiguous child placement: ${parentType} accepts ${childType} in multiple slots`,
          );
        }
        seenChildTypes.add(childType);
      }
    }
    if (definition.allowedChildren.join('|') !== [...seenChildTypes].join('|')) {
      throw new Error(`allowedChildren must be derived from slots for ${parentType}`);
    }
  }
}

assertPageComponentRegistry();

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
  return resolveSlotsForChild(parentType, childType).length === 1;
}

export function findAcceptingSlot(
  parentType: PageComponentType,
  childType: PageComponentType,
  occupancy: ComponentSlotOccupancy | number = 0,
): ComponentSlotDefinition | undefined {
  return resolveSlotForChild(parentType, childType, occupancy);
}

export function canInsertChild(
  parentType: PageComponentType,
  childType: PageComponentType,
  occupancy: ComponentSlotOccupancy | number = 0,
): boolean {
  return Boolean(resolveSlotForChild(parentType, childType, occupancy));
}

export function canRemoveChild(
  parentType: PageComponentType,
  childType: PageComponentType,
  occupancy: ComponentSlotOccupancy | number,
): boolean {
  const slot = resolveSlotForChild(parentType, childType);
  if (!slot) return false;
  return canRemoveFromSlot({ parentType, slotName: slot.name, childType, occupancy });
}

export function canDuplicateChild(
  parentType: PageComponentType,
  childType: PageComponentType,
  occupancy: ComponentSlotOccupancy | number,
): boolean {
  const slot = resolveSlotForChild(parentType, childType, occupancy);
  return Boolean(
    slot && canDuplicateInSlot({ parentType, slotName: slot.name, childType, occupancy }),
  );
}

export { PAGE_STYLE_PROPERTY_GROUPS } from './style-registry';
