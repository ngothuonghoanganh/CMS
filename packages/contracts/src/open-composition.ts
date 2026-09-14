import { z } from 'zod';

import type { ComponentPropertyDefinition } from './component-registry';
import {
  isSafePageStyleValue,
  PAGE_STYLE_PROPERTY_BY_EDITOR_KEY,
  type PageStylePropertyKey,
} from './style-registry';
import {
  canonicalizeOpenCompositionPayload,
  withBoundedNumericSuffix,
} from './open-composition-semantic-integrity';

/**
 * Open Composition is the forward-looking authoring model for the builder.
 *
 * It intentionally lives beside (rather than inside) the legacy PagePayload
 * versions. Legacy payloads remain published compatibility contracts and
 * their Form node is a closed widget. This model gives the next editor/runtime
 * generation a real node graph without silently changing the meaning of
 * existing versions.
 */

export const OPEN_COMPOSITION_SCHEMA_VERSION = 1 as const;
export const OPEN_COMPOSITION_MAX_NODES = 200;
export const OPEN_COMPOSITION_MAX_TREE_DEPTH = 24;
export const OPEN_COMPOSITION_MAX_BEHAVIORS = 200;

const compositionId = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/, 'Composition ids must be stable URL-safe names');
const nodeId = compositionId;

export const OpenCompositionNodeTypeSchema = z.enum([
  'root',
  'section',
  'container',
  'stack',
  'row',
  'grid',
  'card',
  'text',
  'heading',
  'image',
  'icon',
  'button',
  'link',
  'form',
  'form-field',
  'label',
  'input',
  'textarea',
  'select',
  'disclosure',
  'disclosure-item',
  'disclosure-panel',
  'tabs',
  'tab-list',
  'tab-trigger',
  'tab-panel',
  'countdown',
  'extension',
  'divider',
  'list',
  'video',
  'quote',
  'accordion',
  'accordion-item',
  'tab-item',
  'gallery',
  'collection-list',
  'collection-item',
  'global-header',
  'global-footer',
  'navigation-view',
  'site-brand',
  'reusable-instance',
]);
export type OpenCompositionNodeType = z.infer<typeof OpenCompositionNodeTypeSchema>;

export type OpenCompositionNodeKind = 'primitive' | 'semantic';

export type OpenCompositionAuthoringDisposition = 'authorable' | 'read-only' | 'internal';

export type OpenCompositionAuthoringCapability = {
  disposition: OpenCompositionAuthoringDisposition;
  insertable: boolean;
  directInsert: boolean;
  message?: string;
};

export type OpenCompositionNodeDefinition = {
  type: OpenCompositionNodeType;
  kind: OpenCompositionNodeKind;
  label: string;
  description: string;
  allowedParents: readonly OpenCompositionNodeType[];
  allowedChildren: readonly OpenCompositionNodeType[];
  behaviors: readonly OpenCompositionBehaviorKind[];
  authoring: OpenCompositionAuthoringCapability;
};

export type OpenCompositionBehaviorKind = 'field' | 'action' | 'state-binding';

const authoringCapability = (
  disposition: OpenCompositionAuthoringDisposition,
  options: Partial<Omit<OpenCompositionAuthoringCapability, 'disposition'>> = {},
): OpenCompositionAuthoringCapability => ({
  disposition,
  insertable: disposition === 'authorable',
  directInsert: disposition === 'authorable',
  ...options,
});

/**
 * Every V8 node has an explicit authoring disposition. This is intentionally
 * separate from the structural registry so compatibility nodes can remain
 * renderable without appearing in normal Add/Structure surfaces.
 */
const OPEN_COMPOSITION_AUTHORING_CAPABILITIES = {
  root: authoringCapability('internal', {
    message: 'The page root is managed by the builder.',
  }),
  section: authoringCapability('authorable'),
  container: authoringCapability('authorable'),
  stack: authoringCapability('authorable'),
  row: authoringCapability('authorable'),
  grid: authoringCapability('authorable'),
  card: authoringCapability('authorable'),
  text: authoringCapability('authorable'),
  heading: authoringCapability('authorable'),
  image: authoringCapability('authorable'),
  icon: authoringCapability('authorable'),
  button: authoringCapability('authorable'),
  link: authoringCapability('authorable'),
  form: authoringCapability('authorable', {
    directInsert: false,
    message: 'Add a form recipe so fields and its submit action are created together.',
  }),
  'form-field': authoringCapability('authorable'),
  label: authoringCapability('authorable', {
    directInsert: false,
    message: 'Add a complete Form Field to create its label and control together.',
  }),
  input: authoringCapability('authorable', {
    directInsert: false,
    message: 'Change the Form Field type instead of adding a loose control.',
  }),
  textarea: authoringCapability('authorable', {
    directInsert: false,
    message: 'Change the Form Field type instead of adding a loose control.',
  }),
  select: authoringCapability('authorable', {
    directInsert: false,
    message: 'Change the Form Field type instead of adding a loose control.',
  }),
  disclosure: authoringCapability('authorable'),
  'disclosure-item': authoringCapability('authorable', {
    directInsert: false,
    message: 'Add a question from the FAQ editor so its answer stays connected.',
  }),
  'disclosure-panel': authoringCapability('authorable', {
    directInsert: false,
    message: 'Edit the answer content from its FAQ item.',
  }),
  tabs: authoringCapability('authorable'),
  'tab-list': authoringCapability('authorable', {
    directInsert: false,
    message: 'Add tabs from the Tabs editor so labels and content stay connected.',
  }),
  'tab-trigger': authoringCapability('authorable', {
    directInsert: false,
    message: 'Edit this tab name from its Tabs item.',
  }),
  'tab-panel': authoringCapability('authorable', {
    directInsert: false,
    message: 'Edit this tab content directly or from its Tabs item.',
  }),
  countdown: authoringCapability('read-only', {
    message: 'This countdown is managed by its extension settings.',
  }),
  extension: authoringCapability('read-only', {
    message: 'This extension is managed by the Extensions settings.',
  }),
  divider: authoringCapability('authorable'),
  list: authoringCapability('authorable'),
  video: authoringCapability('authorable'),
  quote: authoringCapability('authorable'),
  accordion: authoringCapability('read-only', {
    message: 'This accordion is managed by the legacy component editor.',
  }),
  'accordion-item': authoringCapability('read-only', {
    message: 'This accordion item is managed by the legacy component editor.',
  }),
  'tab-item': authoringCapability('read-only', {
    message: 'This tab item is managed by the legacy component editor.',
  }),
  gallery: authoringCapability('read-only', {
    message: 'This gallery is managed by the legacy component editor.',
  }),
  'collection-list': authoringCapability('read-only', {
    message: 'This collection list is managed by its data source settings.',
  }),
  'collection-item': authoringCapability('read-only', {
    message: 'This collection item is managed by its collection template.',
  }),
  'global-header': authoringCapability('read-only', {
    message: 'This header is managed from the site layout settings.',
  }),
  'global-footer': authoringCapability('read-only', {
    message: 'This footer is managed from the site layout settings.',
  }),
  'navigation-view': authoringCapability('read-only', {
    message: 'This navigation is managed from the Navigation settings.',
  }),
  'site-brand': authoringCapability('read-only', {
    message: 'This site brand is managed from the Brand & styles settings.',
  }),
  'reusable-instance': authoringCapability('read-only', {
    message: 'This reusable block is managed from its source component.',
  }),
} satisfies Record<OpenCompositionNodeType, OpenCompositionAuthoringCapability>;

const contentChildren = [
  'section',
  'container',
  'stack',
  'row',
  'grid',
  'card',
  'text',
  'heading',
  'image',
  'icon',
  'button',
  'link',
  'form',
  'disclosure',
  'tabs',
  'countdown',
  'extension',
  'divider',
  'list',
  'video',
  'quote',
  'accordion',
  'gallery',
  'navigation-view',
  'reusable-instance',
  'collection-list',
] as const satisfies readonly OpenCompositionNodeType[];

const formChildren = [
  'container',
  'stack',
  'row',
  'grid',
  'card',
  'text',
  'heading',
  'icon',
  'button',
  'link',
  'form-field',
  'countdown',
  'extension',
  'divider',
  'list',
  'video',
  'quote',
  'accordion',
  'gallery',
] as const satisfies readonly OpenCompositionNodeType[];

const fieldChildren = [
  'label',
  'input',
  'textarea',
  'select',
] as const satisfies readonly OpenCompositionNodeType[];

const interactiveChildren = [
  'text',
  'heading',
  'icon',
  'container',
  'stack',
  'row',
  'grid',
  'card',
  'image',
  'button',
  'link',
  'form',
  'disclosure',
  'tabs',
] as const satisfies readonly OpenCompositionNodeType[];

const legacyAccordionItemChildren = [
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
] as const satisfies readonly OpenCompositionNodeType[];

const globalHeaderChildren = [
  'site-brand',
  'navigation-view',
  'button',
  'link',
  'extension',
] as const satisfies readonly OpenCompositionNodeType[];

const globalFooterChildren = [
  'site-brand',
  'navigation-view',
  'text',
  'heading',
  'button',
  'link',
  'extension',
] as const satisfies readonly OpenCompositionNodeType[];

function definition(
  type: OpenCompositionNodeType,
  kind: OpenCompositionNodeKind,
  label: string,
  description: string,
  allowedChildren: readonly OpenCompositionNodeType[],
  behaviors: readonly OpenCompositionBehaviorKind[] = [],
): OpenCompositionNodeDefinition {
  return {
    type,
    kind,
    label,
    description,
    allowedParents: [],
    allowedChildren,
    behaviors,
    authoring: OPEN_COMPOSITION_AUTHORING_CAPABILITIES[type],
  };
}

const rawOpenCompositionRegistry = {
  root: definition(
    'root',
    'primitive',
    'Page root',
    'The root of an open composition document.',
    [
      'section',
      'container',
      'stack',
      'row',
      'grid',
      'reusable-instance',
      'global-header',
      'global-footer',
      'collection-list',
    ],
  ),
  section: definition(
    'section',
    'primitive',
    'Section',
    'A full-width page section.',
    contentChildren,
  ),
  container: definition(
    'container',
    'primitive',
    'Container',
    'A bounded content container.',
    contentChildren,
  ),
  stack: definition(
    'stack',
    'primitive',
    'Stack',
    'A vertical composition of elements.',
    contentChildren,
  ),
  row: definition(
    'row',
    'primitive',
    'Row',
    'A horizontal composition of elements.',
    contentChildren,
  ),
  grid: definition(
    'grid',
    'primitive',
    'Grid',
    'A responsive grid composition.',
    contentChildren,
  ),
  card: definition(
    'card',
    'primitive',
    'Card',
    'A visual surface that can contain normal nodes.',
    contentChildren,
  ),
  text: definition(
    'text',
    'primitive',
    'Text',
    'Editable text content.',
    [],
    ['state-binding'],
  ),
  heading: definition(
    'heading',
    'primitive',
    'Heading',
    'A semantic heading with editable content.',
    [],
    ['state-binding'],
  ),
  image: definition(
    'image',
    'primitive',
    'Image',
    'An image asset.',
    [],
    ['state-binding'],
  ),
  icon: definition('icon', 'primitive', 'Icon', 'A visual icon.', [], []),
  button: definition(
    'button',
    'primitive',
    'Button',
    'An actionable button whose visual content remains composable.',
    ['icon', 'text'],
    ['action'],
  ),
  link: definition(
    'link',
    'primitive',
    'Link',
    'A navigational link.',
    ['icon', 'text'],
    ['action'],
  ),
  form: definition(
    'form',
    'semantic',
    'Form',
    'A behavior container for user-submitted values.',
    formChildren,
    ['action', 'state-binding'],
  ),
  'form-field': definition(
    'form-field',
    'semantic',
    'Form Field',
    'A semantic relationship between a field, its label and its control.',
    fieldChildren,
    ['field'],
  ),
  label: definition(
    'label',
    'semantic',
    'Label',
    'A label associated with a form field.',
    [],
    [],
  ),
  input: definition(
    'input',
    'semantic',
    'Input',
    'A single-line form control.',
    [],
    ['state-binding'],
  ),
  textarea: definition(
    'textarea',
    'semantic',
    'Textarea',
    'A multi-line form control.',
    [],
    ['state-binding'],
  ),
  select: definition(
    'select',
    'semantic',
    'Select',
    'A choice form control.',
    [],
    ['state-binding'],
  ),
  disclosure: definition(
    'disclosure',
    'semantic',
    'Disclosure group',
    'A behavior container for expandable items.',
    ['disclosure-item'],
    ['state-binding'],
  ),
  'disclosure-item': definition(
    'disclosure-item',
    'semantic',
    'Disclosure item',
    'An expandable item with a composable trigger and panel.',
    ['button', 'heading', 'text', 'icon', 'disclosure-panel'],
    ['state-binding'],
  ),
  'disclosure-panel': definition(
    'disclosure-panel',
    'semantic',
    'Disclosure panel',
    'Content shown while a disclosure item is open.',
    interactiveChildren,
    ['state-binding'],
  ),
  tabs: definition(
    'tabs',
    'semantic',
    'Tabs',
    'A behavior container for tabbed content.',
    ['tab-list', 'tab-panel'],
    ['state-binding'],
  ),
  'tab-list': definition(
    'tab-list',
    'semantic',
    'Tab list',
    'The composable list of tab triggers.',
    ['tab-trigger'],
    [],
  ),
  'tab-trigger': definition(
    'tab-trigger',
    'semantic',
    'Tab trigger',
    'A tab control bound to a tab panel.',
    ['icon', 'text'],
    ['action', 'state-binding'],
  ),
  'tab-panel': definition(
    'tab-panel',
    'semantic',
    'Tab panel',
    'A composable tab panel.',
    interactiveChildren,
    ['state-binding'],
  ),
  countdown: definition(
    'countdown',
    'semantic',
    'Countdown',
    'Legacy countdown extension retained while future countdown behavior is composed.',
    [],
  ),
  extension: definition(
    'extension',
    'semantic',
    'Custom extension',
    'A legacy extension placement retained for compatibility.',
    [],
  ),
  divider: definition('divider', 'primitive', 'Divider', 'A visual divider.', [], []),
  list: definition('list', 'primitive', 'List', 'A semantic list.', [], []),
  video: definition('video', 'primitive', 'Video', 'A video asset.', [], []),
  quote: definition('quote', 'primitive', 'Quote', 'A quote block.', [], []),
  accordion: definition(
    'accordion',
    'semantic',
    'Legacy Accordion',
    'Legacy accordion container retained for compatibility.',
    ['accordion-item'],
    ['state-binding'],
  ),
  'accordion-item': definition(
    'accordion-item',
    'semantic',
    'Legacy Accordion Item',
    'Legacy accordion item retained for compatibility.',
    legacyAccordionItemChildren,
    ['state-binding'],
  ),
  'tab-item': definition(
    'tab-item',
    'semantic',
    'Legacy Tab Item',
    'Legacy tab item retained for compatibility.',
    interactiveChildren,
    ['state-binding'],
  ),
  gallery: definition(
    'gallery',
    'semantic',
    'Legacy Gallery',
    'Legacy gallery retained for compatibility; new galleries should be recipes.',
    ['image'],
  ),
  'collection-list': definition(
    'collection-list',
    'semantic',
    'Collection list',
    'A repeated composition driven by a data source.',
    ['collection-item'],
    ['state-binding'],
  ),
  'collection-item': definition(
    'collection-item',
    'semantic',
    'Collection item',
    'The editable template repeated by a collection list.',
    interactiveChildren,
    ['state-binding'],
  ),
  'global-header': definition(
    'global-header',
    'semantic',
    'Global Header',
    'Legacy global header retained for compatibility.',
    globalHeaderChildren,
  ),
  'global-footer': definition(
    'global-footer',
    'semantic',
    'Global Footer',
    'Legacy global footer retained for compatibility.',
    globalFooterChildren,
  ),
  'navigation-view': definition(
    'navigation-view',
    'semantic',
    'Navigation View',
    'Legacy navigation resource view retained for compatibility.',
    [],
  ),
  'site-brand': definition(
    'site-brand',
    'semantic',
    'Site Brand',
    'Legacy site brand retained for compatibility.',
    [],
  ),
  'reusable-instance': definition(
    'reusable-instance',
    'semantic',
    'Reusable Instance',
    'Legacy reusable instance retained for compatibility.',
    [],
  ),
} satisfies Record<OpenCompositionNodeType, OpenCompositionNodeDefinition>;

function deriveAllowedParents(
  registry: typeof rawOpenCompositionRegistry,
): Record<OpenCompositionNodeType, readonly OpenCompositionNodeType[]> {
  return Object.fromEntries(
    Object.keys(registry).map((childType) => [
      childType,
      Object.values(registry)
        .filter((parent) =>
          parent.allowedChildren.includes(childType as OpenCompositionNodeType),
        )
        .map((parent) => parent.type),
    ]),
  ) as unknown as Record<OpenCompositionNodeType, readonly OpenCompositionNodeType[]>;
}

const derivedAllowedParents = deriveAllowedParents(rawOpenCompositionRegistry);

export const OPEN_COMPOSITION_REGISTRY = Object.fromEntries(
  Object.entries(rawOpenCompositionRegistry).map(([type, node]) => [
    type,
    { ...node, allowedParents: derivedAllowedParents[type as OpenCompositionNodeType] },
  ]),
) as { [K in OpenCompositionNodeType]: OpenCompositionNodeDefinition };

export type OpenCompositionAuthoringStyleGroup = {
  key: 'layout' | 'size' | 'spacing' | 'typography' | 'background' | 'border' | 'effects';
  label: string;
  description?: string;
  properties: readonly ComponentPropertyDefinition[];
};

export type OpenCompositionAuthoringDefinition = {
  type: OpenCompositionNodeType;
  label: string;
  description: string;
  disposition: OpenCompositionAuthoringDisposition;
  insertable: boolean;
  directInsert: boolean;
  readOnlyMessage?: string;
  /** Explicit content controls. Runtime props are never used to infer these. */
  properties: readonly ComponentPropertyDefinition[];
  /** Explicit style capabilities grouped for progressive disclosure. */
  styleGroups: readonly OpenCompositionAuthoringStyleGroup[];
};

const openContentProperty = (
  property: Omit<ComponentPropertyDefinition, 'group'>,
): ComponentPropertyDefinition => ({
  ...property,
  group: 'content',
});

const openStyleProperty = (
  key: PageStylePropertyKey,
  overrides: Partial<ComponentPropertyDefinition> = {},
): ComponentPropertyDefinition => {
  const property = PAGE_STYLE_PROPERTY_BY_EDITOR_KEY[key];
  return {
    ...property,
    ...overrides,
    key,
    label: overrides.label ?? property?.label ?? key,
    control: overrides.control ?? property?.control ?? 'text',
    group: 'style',
  };
};

const OPEN_COMPOSITION_STYLE_GROUPS: readonly OpenCompositionAuthoringStyleGroup[] = [
  {
    key: 'layout',
    label: 'Layout',
    description: 'Choose how this content is arranged.',
    properties: [
      openStyleProperty('display', {
        label: 'Layout',
        description: 'Stack content vertically, place it in a row, or use columns.',
      }),
      openStyleProperty('flex-direction', { label: 'Direction' }),
      openStyleProperty('justify-content', { label: 'Distribution' }),
      openStyleProperty('align-items', { label: 'Content alignment' }),
      openStyleProperty('flex-wrap', { label: 'Wrapping' }),
      openStyleProperty('grid-template-columns', {
        label: 'Columns',
        control: 'number',
        min: 1,
        max: 999,
        step: 1,
        defaultValue: 3,
        description: 'Enter a positive whole number of columns.',
      }),
    ],
  },
  {
    key: 'size',
    label: 'Size',
    properties: [
      openStyleProperty('width', { label: 'Width' }),
      openStyleProperty('height', { label: 'Height' }),
      openStyleProperty('max-width', { label: 'Maximum width' }),
      openStyleProperty('max-height', { label: 'Maximum height' }),
    ],
  },
  {
    key: 'spacing',
    label: 'Spacing',
    properties: [
      openStyleProperty('padding', {
        label: 'Inside spacing',
        description: 'Add space inside the edges of this element.',
      }),
      openStyleProperty('margin', {
        label: 'Outside spacing',
        description: 'Add space around this element.',
      }),
      openStyleProperty('gap', {
        label: 'Space between items',
        description: 'Set the space between items in a stack, row, or grid.',
      }),
    ],
  },
  {
    key: 'typography',
    label: 'Typography',
    properties: [
      openStyleProperty('font-family', { label: 'Font' }),
      openStyleProperty('font-size', { label: 'Size' }),
      openStyleProperty('font-weight', { label: 'Weight' }),
      openStyleProperty('line-height', { label: 'Line height' }),
      openStyleProperty('text-align', { label: 'Text alignment' }),
      openStyleProperty('color', { label: 'Text color' }),
      openStyleProperty('text-decoration', { label: 'Text decoration' }),
    ],
  },
  {
    key: 'background',
    label: 'Background',
    properties: [openStyleProperty('background-color', { label: 'Background color' })],
  },
  {
    key: 'border',
    label: 'Border',
    properties: [
      openStyleProperty('border-style', { label: 'Border style' }),
      openStyleProperty('border-width', { label: 'Border width' }),
      openStyleProperty('border-color', { label: 'Border color' }),
      openStyleProperty('border-radius', { label: 'Corner radius' }),
    ],
  },
  {
    key: 'effects',
    label: 'Effects',
    properties: [
      openStyleProperty('opacity', { label: 'Opacity' }),
      openStyleProperty('box-shadow', { label: 'Shadow' }),
    ],
  },
] as const;

const openStyleGroupsFor = (
  keys: readonly PageStylePropertyKey[],
): readonly OpenCompositionAuthoringStyleGroup[] => {
  const allowed = new Set(keys);
  return OPEN_COMPOSITION_STYLE_GROUPS.flatMap((group) => {
    const properties = group.properties.filter((property) =>
      allowed.has(property.key as PageStylePropertyKey),
    );
    return properties.length > 0 ? [{ ...group, properties }] : [];
  });
};

const OPEN_LAYOUT_STYLE_KEYS = [
  'display',
  'flex-direction',
  'justify-content',
  'align-items',
  'flex-wrap',
  'grid-template-columns',
  'width',
  'max-width',
  'padding',
  'margin',
  'gap',
  'background-color',
  'border-style',
  'border-width',
  'border-color',
  'border-radius',
  'box-shadow',
] as const satisfies readonly PageStylePropertyKey[];
const OPEN_CONTENT_STYLE_KEYS = [
  'width',
  'height',
  'max-width',
  'max-height',
  'padding',
  'margin',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'text-align',
  'color',
  'text-decoration',
  'background-color',
  'border-style',
  'border-width',
  'border-color',
  'border-radius',
  'box-shadow',
] as const satisfies readonly PageStylePropertyKey[];

const OPEN_FORM_STYLE_KEYS = [
  'width',
  'max-width',
  'padding',
  'margin',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'color',
  'background-color',
  'border-style',
  'border-width',
  'border-color',
  'border-radius',
  'box-shadow',
] as const satisfies readonly PageStylePropertyKey[];

const openAuthoringDefinition = (
  type: OpenCompositionNodeType,
  properties: readonly ComponentPropertyDefinition[],
  styleKeys: readonly PageStylePropertyKey[] = [],
): OpenCompositionAuthoringDefinition => {
  const capability = OPEN_COMPOSITION_REGISTRY[type].authoring;
  return {
    type,
    label: OPEN_COMPOSITION_REGISTRY[type].label,
    description: OPEN_COMPOSITION_REGISTRY[type].description,
    disposition: capability.disposition,
    insertable: capability.insertable,
    directInsert: capability.directInsert,
    ...(capability.message ? { readOnlyMessage: capability.message } : {}),
    properties,
    styleGroups: openStyleGroupsFor(styleKeys),
  };
};

const openTextProperties = [
  openContentProperty({
    key: 'text',
    label: 'Text',
    control: 'textarea',
    required: true,
    placeholder: 'Add your text here',
    defaultValue: '',
    help: { text: 'Write the words visitors should see.' },
  }),
];

const openLinkProperties = [
  openContentProperty({
    key: 'label',
    label: 'Link text',
    control: 'text',
    required: true,
    placeholder: 'Learn more',
    defaultValue: 'Link',
  }),
  openContentProperty({
    key: 'href',
    label: 'Link',
    control: 'link',
    placeholder: '/',
    defaultValue: '/',
    normalization: ['trim', 'url'],
  }),
  openContentProperty({
    key: 'target',
    label: 'Open link in',
    control: 'select',
    defaultValue: '_self',
    options: [
      { label: 'This tab', value: '_self' },
      { label: 'New tab', value: '_blank' },
    ],
  }),
];

const openControlProperties = [
  openContentProperty({
    key: 'type',
    label: 'Field type',
    control: 'select',
    defaultValue: 'text',
    options: [
      { label: 'Text', value: 'text' },
      { label: 'Email', value: 'email' },
      { label: 'Phone', value: 'phone' },
      { label: 'Checkbox', value: 'checkbox' },
      { label: 'Multiple choice', value: 'radio' },
      { label: 'Dropdown', value: 'select' },
    ],
  }),
  openContentProperty({
    key: 'placeholder',
    label: 'Placeholder',
    control: 'text',
    allowEmpty: true,
    placeholder: 'Optional hint',
  }),
  openContentProperty({
    key: 'options',
    label: 'Options',
    control: 'custom',
    customEditor: 'options',
    visibleWhen: {
      property: 'type',
      operator: 'equals',
      value: ['select', 'radio'],
    },
    help: { text: 'Add the choices visitors can select.' },
  }),
];

const openFormFieldProperties = [
  openContentProperty({
    key: 'label',
    label: 'Field label',
    control: 'text',
    required: true,
    placeholder: 'Field label',
    defaultValue: 'Field label',
  }),
  openContentProperty({
    key: 'type',
    label: 'Field type',
    control: 'select',
    defaultValue: 'text',
    options: [
      { label: 'Text', value: 'text' },
      { label: 'Email', value: 'email' },
      { label: 'Phone', value: 'phone' },
      { label: 'Long text', value: 'textarea' },
      { label: 'Dropdown', value: 'select' },
      { label: 'Checkbox', value: 'checkbox' },
      { label: 'Multiple choice', value: 'radio' },
    ],
  }),
  openContentProperty({
    key: 'required',
    label: 'Required field',
    control: 'toggle',
    defaultValue: false,
  }),
  openContentProperty({
    key: 'placeholder',
    label: 'Placeholder',
    control: 'text',
    allowEmpty: true,
    placeholder: 'Optional hint',
  }),
  openContentProperty({
    key: 'options',
    label: 'Options',
    control: 'custom',
    customEditor: 'options',
    visibleWhen: {
      property: 'type',
      operator: 'equals',
      value: ['select', 'radio'],
    },
    help: { text: 'Add the choices visitors can select.' },
  }),
] as const;

const openDisclosureProperties = [
  openContentProperty({
    key: 'allowMultiple',
    label: 'Allow multiple answers to stay open',
    editingScope: 'design',
    control: 'toggle',
    defaultValue: false,
  }),
  openContentProperty({
    key: 'ariaLabel',
    label: 'FAQ label',
    editingScope: 'content',
    control: 'text',
    allowEmpty: true,
    defaultValue: 'FAQ',
  }),
] as const;

const openDisclosureItemProperties = [
  openContentProperty({
    key: 'question',
    label: 'Question',
    editingScope: 'content',
    control: 'text',
    required: true,
    defaultValue: 'Question',
  }),
  openContentProperty({
    key: 'defaultOpen',
    label: 'Open initially',
    editingScope: 'design',
    control: 'toggle',
    defaultValue: false,
  }),
] as const;

const openTabsProperties = [
  openContentProperty({
    key: 'orientation',
    label: 'Direction',
    editingScope: 'design',
    control: 'select',
    defaultValue: 'horizontal',
    options: [
      { label: 'Horizontal', value: 'horizontal' },
      { label: 'Vertical', value: 'vertical' },
    ],
  }),
  openContentProperty({
    key: 'ariaLabel',
    label: 'Tabs label',
    editingScope: 'content',
    control: 'text',
    allowEmpty: true,
    defaultValue: 'Tabs',
  }),
] as const;

const openTabTriggerProperties = [
  openContentProperty({
    key: 'label',
    label: 'Tab name',
    editingScope: 'content',
    control: 'text',
    required: true,
    defaultValue: 'Tab',
  }),
  openContentProperty({
    key: 'openInitially',
    label: 'Open initially',
    editingScope: 'design',
    control: 'toggle',
    defaultValue: false,
  }),
] as const;

const openListProperties = [
  openContentProperty({
    key: 'ordered',
    label: 'List type',
    editingScope: 'content',
    control: 'select',
    defaultValue: 'false',
    options: [
      { label: 'Bullets', value: 'false' },
      { label: 'Numbers', value: 'true' },
    ],
  }),
  openContentProperty({
    key: 'items',
    label: 'Items',
    editingScope: 'content',
    control: 'custom',
    customEditor: 'list',
  }),
] as const;

const openCompositionAuthoringEntries: OpenCompositionAuthoringDefinition[] = [
  openAuthoringDefinition('root', [], OPEN_LAYOUT_STYLE_KEYS),
  ...(['section', 'container', 'stack', 'row', 'grid', 'card'] as const).map((type) =>
    openAuthoringDefinition(type, [], OPEN_LAYOUT_STYLE_KEYS),
  ),
  openAuthoringDefinition('text', openTextProperties, OPEN_CONTENT_STYLE_KEYS),
  openAuthoringDefinition(
    'heading',
    [
      openContentProperty({
        key: 'text',
        label: 'Heading text',
        control: 'textarea',
        required: true,
        placeholder: 'Your heading',
        defaultValue: 'Your heading',
      }),
      openContentProperty({
        key: 'level',
        label: 'Heading level',
        control: 'select',
        defaultValue: 2,
        options: [1, 2, 3, 4, 5, 6].map((level) => ({
          label: `Heading ${level}`,
          value: String(level),
        })),
      }),
    ],
    OPEN_CONTENT_STYLE_KEYS,
  ),
  openAuthoringDefinition(
    'image',
    [
      openContentProperty({
        key: 'src',
        label: 'Image',
        control: 'asset',
        assetKind: 'image',
        required: true,
      }),
      openContentProperty({
        key: 'alt',
        label: 'Description for screen readers',
        control: 'text',
        placeholder: 'Describe this image',
        defaultValue: '',
      }),
    ],
    OPEN_CONTENT_STYLE_KEYS,
  ),
  openAuthoringDefinition(
    'icon',
    [
      openContentProperty({
        key: 'name',
        label: 'Icon',
        control: 'select',
        defaultValue: 'arrow-right',
        options: ['arrow-right', 'check', 'mail', 'phone', 'star', 'heart'].map(
          (name) => ({
            label: name.replace('-', ' '),
            value: name,
          }),
        ),
      }),
    ],
    OPEN_CONTENT_STYLE_KEYS,
  ),
  openAuthoringDefinition(
    'button',
    [
      openContentProperty({
        key: 'label',
        label: 'Button text',
        control: 'text',
        required: true,
        placeholder: 'Button',
        defaultValue: 'Button',
      }),
      ...openLinkProperties.slice(1),
    ],
    OPEN_CONTENT_STYLE_KEYS,
  ),
  openAuthoringDefinition('link', openLinkProperties, OPEN_CONTENT_STYLE_KEYS),
  openAuthoringDefinition(
    'form',
    [
      openContentProperty({
        key: 'successMessage',
        label: 'Message after sending',
        control: 'textarea',
        placeholder: 'Thanks — we will be in touch soon.',
        defaultValue: 'Thanks — we will be in touch soon.',
      }),
    ],
    OPEN_FORM_STYLE_KEYS,
  ),
  openAuthoringDefinition('form-field', openFormFieldProperties, OPEN_FORM_STYLE_KEYS),
  openAuthoringDefinition('label', openTextProperties, OPEN_CONTENT_STYLE_KEYS),
  ...(['input', 'textarea', 'select'] as const).map((type) =>
    openAuthoringDefinition(type, openControlProperties, OPEN_CONTENT_STYLE_KEYS),
  ),
  openAuthoringDefinition('divider', [], ['width', 'margin', 'background-color']),
  openAuthoringDefinition(
    'video',
    [
      openContentProperty({
        key: 'src',
        label: 'Video',
        control: 'asset',
        assetKind: 'video',
        required: true,
      }),
      openContentProperty({
        key: 'poster',
        label: 'Poster image',
        control: 'asset',
        assetKind: 'image',
        allowEmpty: true,
      }),
      openContentProperty({
        key: 'controls',
        label: 'Show controls',
        control: 'toggle',
        defaultValue: true,
      }),
    ],
    OPEN_CONTENT_STYLE_KEYS,
  ),
  openAuthoringDefinition(
    'quote',
    [
      openContentProperty({
        key: 'text',
        label: 'Quote',
        control: 'textarea',
        required: true,
        placeholder: 'Add a quote',
        defaultValue: 'Add a quote',
      }),
      openContentProperty({
        key: 'cite',
        label: 'Attribution',
        control: 'text',
        allowEmpty: true,
        placeholder: 'Who said this?',
      }),
    ],
    OPEN_CONTENT_STYLE_KEYS,
  ),
  openAuthoringDefinition(
    'disclosure',
    openDisclosureProperties,
    OPEN_CONTENT_STYLE_KEYS,
  ),
  openAuthoringDefinition(
    'disclosure-item',
    openDisclosureItemProperties,
    OPEN_CONTENT_STYLE_KEYS,
  ),
  openAuthoringDefinition('disclosure-panel', [], OPEN_CONTENT_STYLE_KEYS),
  openAuthoringDefinition('tabs', openTabsProperties, OPEN_CONTENT_STYLE_KEYS),
  openAuthoringDefinition('tab-list', [], OPEN_CONTENT_STYLE_KEYS),
  openAuthoringDefinition(
    'tab-trigger',
    openTabTriggerProperties,
    OPEN_CONTENT_STYLE_KEYS,
  ),
  openAuthoringDefinition('tab-panel', [], OPEN_CONTENT_STYLE_KEYS),
  openAuthoringDefinition('list', openListProperties, OPEN_CONTENT_STYLE_KEYS),
];

const openCompositionAuthoringEntriesByType = new Map(
  openCompositionAuthoringEntries.map((entry) => [entry.type, entry]),
);

const openCompositionAuthoringFallbacks = Object.keys(OPEN_COMPOSITION_REGISTRY).map(
  (type) => {
    const nodeType = type as OpenCompositionNodeType;
    const existing = openCompositionAuthoringEntriesByType.get(nodeType);
    if (existing) return existing;
    const capability = OPEN_COMPOSITION_REGISTRY[nodeType].authoring;
    if (capability.disposition === 'authorable') {
      throw new Error(`Missing authoring metadata for ${nodeType}`);
    }
    return openAuthoringDefinition(nodeType, [], []);
  },
);

export const OPEN_COMPOSITION_AUTHORING_REGISTRY = Object.fromEntries(
  openCompositionAuthoringFallbacks.map((entry) => [entry.type, entry]),
) as { [K in OpenCompositionNodeType]: OpenCompositionAuthoringDefinition };

export function getOpenCompositionAuthoringDefinition(
  type: OpenCompositionNodeType,
): OpenCompositionAuthoringDefinition {
  return OPEN_COMPOSITION_AUTHORING_REGISTRY[type];
}

export function getOpenCompositionAuthoringProperty(
  type: OpenCompositionNodeType,
  property: string,
): ComponentPropertyDefinition | undefined {
  return OPEN_COMPOSITION_AUTHORING_REGISTRY[type].properties.find(
    (candidate) => candidate.key === property,
  );
}

export function isOpenCompositionNodeType(
  value: unknown,
): value is OpenCompositionNodeType {
  return OpenCompositionNodeTypeSchema.safeParse(value).success;
}

const FORM_FIELD_SEMANTIC_CHILDREN = new Set<OpenCompositionNodeType>([
  'label',
  'input',
  'textarea',
  'select',
]);

/**
 * Form Field owns its label and control as one semantic authoring unit. This
 * rule is shared by command, placement, layer and inspector surfaces so a
 * structural action cannot split the relationship accidentally.
 */
export function isSemanticOwnedFormFieldChild(
  parentType: OpenCompositionNodeType | undefined,
  childType: OpenCompositionNodeType | undefined,
): boolean {
  return (
    parentType === 'form-field' &&
    childType !== undefined &&
    FORM_FIELD_SEMANTIC_CHILDREN.has(childType)
  );
}

/**
 * Compound nodes expose real GrapesJS children, but their semantic shells are
 * still one authoring unit. This predicate is shared by command, placement,
 * layer and canvas code so a user cannot split a question or tab pair.
 */
export function isSemanticOwnedOpenCompositionChild(
  parentType: OpenCompositionNodeType | undefined,
  childType: OpenCompositionNodeType | undefined,
  grandparentType?: OpenCompositionNodeType,
): boolean {
  if (!parentType || !childType) return false;
  if (isSemanticOwnedFormFieldChild(parentType, childType)) return true;
  if (
    (parentType === 'disclosure' && childType === 'disclosure-item') ||
    (parentType === 'disclosure-item' &&
      (childType === 'button' || childType === 'disclosure-panel')) ||
    (parentType === 'tabs' && (childType === 'tab-list' || childType === 'tab-panel')) ||
    (parentType === 'tab-list' && childType === 'tab-trigger')
  ) {
    return true;
  }
  return (
    (parentType === 'button' || parentType === 'tab-trigger') &&
    (childType === 'icon' || childType === 'text') &&
    grandparentType !== undefined &&
    (grandparentType === 'disclosure-item' || grandparentType === 'tab-list')
  );
}

/** A parent whose children can only be changed through an aggregate command. */
export function isOpenCompositionManagedContainer(
  type: OpenCompositionNodeType | undefined,
): boolean {
  return (
    type === 'disclosure' ||
    type === 'disclosure-item' ||
    type === 'tab-list' ||
    type === 'tab-trigger' ||
    type === 'tabs'
  );
}

export function isOpenCompositionAtomicNodeType(
  type: OpenCompositionNodeType | undefined,
): type is 'form-field' {
  return type === 'form-field';
}

/** Returns whether a live structural mutation may target this node. */
export function canMutateStructuralNode(
  nodeType: OpenCompositionNodeType,
  parentType: OpenCompositionNodeType | undefined,
  grandparentType?: OpenCompositionNodeType,
): boolean {
  return !isSemanticOwnedOpenCompositionChild(parentType, nodeType, grandparentType);
}

export function canComposeChild(
  parentType: OpenCompositionNodeType,
  childType: OpenCompositionNodeType,
): boolean {
  return OPEN_COMPOSITION_REGISTRY[parentType].allowedChildren.includes(childType);
}

export function openCompositionInsertableChildren(
  parentType: OpenCompositionNodeType,
): readonly OpenCompositionNodeType[] {
  if (isOpenCompositionAtomicNodeType(parentType)) return [];
  if (isOpenCompositionManagedContainer(parentType)) return [];
  return OPEN_COMPOSITION_REGISTRY[parentType].allowedChildren.filter(
    (childType) => OPEN_COMPOSITION_REGISTRY[childType].authoring.directInsert,
  );
}

export const CompositionStyleValueSchema = z.union([
  z
    .string()
    .trim()
    .min(1)
    .max(2_048)
    .refine(isSafePageStyleValue, 'Style value contains unsafe CSS'),
  z
    .object({
      kind: z.literal('token'),
      tokenId: z
        .string()
        .trim()
        .min(1)
        .max(128)
        .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/),
    })
    .strict(),
]);
export type CompositionStyleValue = z.infer<typeof CompositionStyleValueSchema>;

export const CompositionStyleBlockSchema = z.record(
  z.string().trim().min(1).max(120),
  CompositionStyleValueSchema,
);
export type CompositionStyleBlock = z.infer<typeof CompositionStyleBlockSchema>;

const compositionStyleObjectSchema = z
  .object({
    base: CompositionStyleBlockSchema,
    tablet: CompositionStyleBlockSchema.optional(),
    mobile: CompositionStyleBlockSchema.optional(),
  })
  .strict();
export const CompositionStyleSchema = compositionStyleObjectSchema.optional();
export type CompositionStyle = z.infer<typeof compositionStyleObjectSchema>;

const openCompositionProps = z.record(z.string().trim().min(1).max(120), z.unknown());

export type OpenCompositionNode = {
  id: string;
  type: OpenCompositionNodeType;
  props: Record<string, unknown>;
  style?: CompositionStyle | undefined;
  partsStyle?: Record<string, CompositionStyle> | undefined;
  children: OpenCompositionNode[];
};

/** The persisted item record used by a native Open Composition List. */
export const OpenCompositionListItemSchema = z
  .object({
    id: nodeId,
    text: z.string().trim().min(1).max(1_000),
  })
  .strict();
export type OpenCompositionListItem = z.infer<typeof OpenCompositionListItemSchema>;

export const OpenCompositionListPropsSchema = z
  .object({
    ordered: z.boolean(),
    items: z.array(OpenCompositionListItemSchema).min(1).max(100),
  })
  .strict();
export type OpenCompositionListProps = z.infer<typeof OpenCompositionListPropsSchema>;

const openCompositionPartStyles = z
  .record(compositionId, compositionStyleObjectSchema)
  .optional();

const openCompositionNodeSchema: z.ZodType<OpenCompositionNode> = z.lazy(() =>
  z
    .object({
      id: nodeId,
      type: OpenCompositionNodeTypeSchema,
      props: openCompositionProps,
      style: CompositionStyleSchema,
      partsStyle: openCompositionPartStyles,
      children: z.array(openCompositionNodeSchema).max(200),
    })
    .strict(),
);

export const OpenCompositionNodeSchema = openCompositionNodeSchema;

const behaviorId = compositionId;
const fieldKey = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/);

export const OpenCompositionFieldBehaviorSchema = z
  .object({
    id: behaviorId,
    kind: z.literal('field'),
    nodeId,
    formNodeId: nodeId,
    fieldKey,
    inputType: z.enum([
      'text',
      'email',
      'phone',
      'textarea',
      'select',
      'checkbox',
      'radio',
    ]),
    required: z.boolean(),
    labelNodeId: nodeId.optional(),
    controlNodeId: nodeId.optional(),
  })
  .strict();

export const OpenCompositionActionBehaviorSchema = z
  .object({
    id: behaviorId,
    kind: z.literal('action'),
    nodeId,
    event: z.enum(['click', 'submit', 'load']),
    action: z.enum(['submit-form', 'reset-form', 'toggle', 'navigate']),
    targetNodeId: nodeId.optional(),
  })
  .strict()
  .superRefine((behavior, context) => {
    if (
      (behavior.action === 'submit-form' || behavior.action === 'reset-form') &&
      !behavior.targetNodeId
    ) {
      context.addIssue({
        code: 'custom',
        path: ['targetNodeId'],
        message: `${behavior.action} requires targetNodeId`,
      });
    }
  });

export const OpenCompositionStateBindingBehaviorSchema = z
  .object({
    id: behaviorId,
    kind: z.literal('state-binding'),
    nodeId,
    property: z.string().trim().min(1).max(120),
    statePath: z.string().trim().min(1).max(200),
    condition: z
      .object({
        operator: z.enum(['equals', 'notEquals', 'isTruthy', 'isFalsy']),
        value: z.unknown().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const OpenCompositionBehaviorSchema = z.discriminatedUnion('kind', [
  OpenCompositionFieldBehaviorSchema,
  OpenCompositionActionBehaviorSchema,
  OpenCompositionStateBindingBehaviorSchema,
]);
export type OpenCompositionBehavior = z.infer<typeof OpenCompositionBehaviorSchema>;

function flattenCompositionNodes(root: OpenCompositionNode): OpenCompositionNode[] {
  const nodes: OpenCompositionNode[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    nodes.push(current);
    pending.push(...current.children);
  }
  return nodes;
}

function nodePathMap(root: OpenCompositionNode): Map<string, OpenCompositionNode> {
  return new Map(flattenCompositionNodes(root).map((node) => [node.id, node]));
}

function validateCompositionTree(
  root: OpenCompositionNode,
  behaviors: readonly OpenCompositionBehavior[],
  context: z.RefinementCtx,
): void {
  if (root.type !== 'root' || root.id !== 'root') {
    context.addIssue({
      code: 'custom',
      path: ['root'],
      message: 'Open Composition root must have type root and id root',
    });
  }

  const nodes = flattenCompositionNodes(root);
  if (nodes.length > OPEN_COMPOSITION_MAX_NODES) {
    context.addIssue({
      code: 'custom',
      path: ['root'],
      message: `OPEN_COMPOSITION_NODE_LIMIT_EXCEEDED: maximum is ${OPEN_COMPOSITION_MAX_NODES}`,
    });
  }

  const ids = new Set<string>();
  const pending: Array<{
    node: OpenCompositionNode;
    path: (string | number)[];
    depth: number;
    parentType?: OpenCompositionNodeType;
  }> = [{ node: root, path: ['root'], depth: 1 }];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    if (current.depth > OPEN_COMPOSITION_MAX_TREE_DEPTH) {
      context.addIssue({
        code: 'custom',
        path: current.path,
        message: `OPEN_COMPOSITION_DEPTH_LIMIT_EXCEEDED: maximum is ${OPEN_COMPOSITION_MAX_TREE_DEPTH}`,
      });
      continue;
    }
    if (ids.has(current.node.id)) {
      context.addIssue({
        code: 'custom',
        path: [...current.path, 'id'],
        message: `Duplicate open composition node id: ${current.node.id}`,
      });
    }
    ids.add(current.node.id);
    const definition = OPEN_COMPOSITION_REGISTRY[current.node.type];
    if (current.parentType && !definition.allowedParents.includes(current.parentType)) {
      context.addIssue({
        code: 'custom',
        path: [...current.path, 'type'],
        message: `Node type ${current.node.type} cannot be placed inside ${current.parentType}`,
      });
    }
    current.node.children.forEach((child, index) => {
      if (!canComposeChild(current.node.type, child.type)) {
        context.addIssue({
          code: 'custom',
          path: [...current.path, 'children', index, 'type'],
          message: `Node type ${current.node.type} cannot contain ${child.type} children`,
        });
      }
      pending.push({
        node: child,
        path: [...current.path, 'children', index],
        depth: current.depth + 1,
        parentType: current.node.type,
      });
    });
    if (definition.type === 'form' && !current.node.props.formKey) {
      context.addIssue({
        code: 'custom',
        path: [...current.path, 'props', 'formKey'],
        message: 'A Form requires a stable formKey',
      });
    }
  }

  const byId = nodePathMap(root);
  const behaviorIds = new Set<string>();
  for (const [index, behavior] of behaviors.entries()) {
    if (behaviorIds.has(behavior.id)) {
      context.addIssue({
        code: 'custom',
        path: ['behaviors', index, 'id'],
        message: `Duplicate open composition behavior id: ${behavior.id}`,
      });
    }
    behaviorIds.add(behavior.id);
    const source = byId.get(behavior.nodeId);
    if (!source) {
      context.addIssue({
        code: 'custom',
        path: ['behaviors', index, 'nodeId'],
        message: `Behavior references missing node: ${behavior.nodeId}`,
      });
      continue;
    }
    if (!OPEN_COMPOSITION_REGISTRY[source.type].behaviors.includes(behavior.kind)) {
      context.addIssue({
        code: 'custom',
        path: ['behaviors', index, 'kind'],
        message: `${source.type} does not support ${behavior.kind} behavior`,
      });
    }

    if (behavior.kind === 'field') {
      const form = byId.get(behavior.formNodeId);
      const label = behavior.labelNodeId ? byId.get(behavior.labelNodeId) : undefined;
      const control = behavior.controlNodeId
        ? byId.get(behavior.controlNodeId)
        : undefined;
      if (!form || form.type !== 'form') {
        context.addIssue({
          code: 'custom',
          path: ['behaviors', index, 'formNodeId'],
          message: 'Field behavior must target a Form node',
        });
      }
      if (source.type !== 'form-field') {
        context.addIssue({
          code: 'custom',
          path: ['behaviors', index, 'nodeId'],
          message: 'Field behavior must be attached to a Form Field node',
        });
      }
      if (behavior.labelNodeId && (!label || label.type !== 'label')) {
        context.addIssue({
          code: 'custom',
          path: ['behaviors', index, 'labelNodeId'],
          message: 'labelNodeId must reference a Label node',
        });
      }
      if (
        behavior.controlNodeId &&
        (!control || !['input', 'textarea', 'select'].includes(control.type))
      ) {
        context.addIssue({
          code: 'custom',
          path: ['behaviors', index, 'controlNodeId'],
          message: 'controlNodeId must reference an input control',
        });
      }
    }

    if (behavior.kind === 'action' && behavior.targetNodeId) {
      const target = byId.get(behavior.targetNodeId);
      if (!target) {
        context.addIssue({
          code: 'custom',
          path: ['behaviors', index, 'targetNodeId'],
          message: `Action references missing target node: ${behavior.targetNodeId}`,
        });
      } else if (
        (behavior.action === 'submit-form' || behavior.action === 'reset-form') &&
        target.type !== 'form'
      ) {
        context.addIssue({
          code: 'custom',
          path: ['behaviors', index, 'targetNodeId'],
          message: `${behavior.action} must target a Form node`,
        });
      }
    }
  }
}

export const OpenCompositionDocumentSchema = z
  .object({
    schemaVersion: z.literal(OPEN_COMPOSITION_SCHEMA_VERSION),
    root: OpenCompositionNodeSchema,
    behaviors: z.array(OpenCompositionBehaviorSchema).max(OPEN_COMPOSITION_MAX_BEHAVIORS),
  })
  .strict()
  .superRefine((document, context) => {
    validateCompositionTree(document.root, document.behaviors, context);
  });
export type OpenCompositionDocument = z.infer<typeof OpenCompositionDocumentSchema>;

const openCompositionMetadataSchema = z
  .object({
    documentTitle: z.string().trim().min(1).max(200),
    documentDescription: z.string().trim().max(500).optional(),
  })
  .strict();

/** Versioned payload envelope used by the next editor/runtime generation. */
export const OpenCompositionPayloadSchema = z
  .object({
    version: z.literal(8),
    metadata: openCompositionMetadataSchema,
    root: OpenCompositionNodeSchema,
    behaviors: z.array(OpenCompositionBehaviorSchema).max(OPEN_COMPOSITION_MAX_BEHAVIORS),
  })
  .strict()
  .superRefine((payload, context) => {
    validateCompositionTree(payload.root, payload.behaviors, context);
    const serializedSize = new TextEncoder().encode(JSON.stringify(payload)).length;
    if (serializedSize > 256 * 1024) {
      context.addIssue({
        code: 'custom',
        path: [],
        message: 'OPEN_COMPOSITION_PAYLOAD_TOO_LARGE: maximum is 262144 bytes',
      });
    }
  });
export type OpenCompositionPayload = z.infer<typeof OpenCompositionPayloadSchema>;

type LegacyCompositionNode = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  style?: unknown;
  partsStyle?: unknown;
  children: LegacyCompositionNode[];
};

type LegacyPagePayload = {
  version: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  metadata: { documentTitle: string; documentDescription?: string };
  root: LegacyCompositionNode;
};

function boundedCompositionId(
  prefix: string,
  source: string,
  usedIds?: Set<string>,
): string {
  const value = `${prefix}-${source}`.replace(/[^A-Za-z0-9_-]/g, '-');
  const initial = (/^[A-Za-z]/.test(value) ? value : `node-${value}`).slice(0, 128);
  if (!usedIds) return initial;
  let candidate = initial;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = withBoundedNumericSuffix(initial, suffix, 128);
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

type LegacyMigrationContext = {
  nodeIds: Set<string>;
  behaviorIds: Set<string>;
};

function legacyBehaviorId(
  prefix: string,
  source: string,
  context: LegacyMigrationContext,
): string {
  return boundedCompositionId(prefix, source, context.behaviorIds);
}

function legacyStyle(value: unknown): CompositionStyle | undefined {
  const parsed = CompositionStyleSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function legacyPartStyle(
  partsStyle: unknown,
  partName: string,
): CompositionStyle | undefined {
  if (!partsStyle || typeof partsStyle !== 'object' || Array.isArray(partsStyle)) {
    return undefined;
  }
  return legacyStyle((partsStyle as Record<string, unknown>)[partName]);
}

function migratedFieldNode(
  form: LegacyCompositionNode,
  field: Record<string, unknown>,
  index: number,
  behaviors: OpenCompositionBehavior[],
  context?: LegacyMigrationContext,
): OpenCompositionNode {
  const fieldId = typeof field.id === 'string' ? field.id : `field-${index + 1}`;
  const fieldType = typeof field.type === 'string' ? field.type : 'text';
  const fieldNodeId = boundedCompositionId(form.id, `field-${fieldId}`, context?.nodeIds);
  const labelNodeId = boundedCompositionId(fieldNodeId, 'label', context?.nodeIds);
  const controlNodeId = boundedCompositionId(fieldNodeId, 'control', context?.nodeIds);
  const label = typeof field.label === 'string' ? field.label : fieldId;
  const required = field.required === true;
  const controlType = fieldType === 'textarea' ? 'textarea' : 'input';
  const controlProps: Record<string, unknown> = {
    type: fieldType,
    name: typeof field.name === 'string' ? field.name : fieldId,
    ...(typeof field.placeholder === 'string' ? { placeholder: field.placeholder } : {}),
    ...(Array.isArray(field.options) ? { options: field.options } : {}),
  };
  behaviors.push({
    id: context
      ? legacyBehaviorId(fieldNodeId, 'behavior', context)
      : boundedCompositionId(fieldNodeId, 'behavior'),
    kind: 'field',
    nodeId: fieldNodeId,
    formNodeId: form.id,
    fieldKey: fieldId,
    inputType: [
      'text',
      'email',
      'phone',
      'textarea',
      'select',
      'checkbox',
      'radio',
    ].includes(fieldType)
      ? (fieldType as
          'text' | 'email' | 'phone' | 'textarea' | 'select' | 'checkbox' | 'radio')
      : 'text',
    required,
    labelNodeId,
    controlNodeId,
  });
  return {
    id: fieldNodeId,
    type: 'form-field',
    props: { fieldKey: fieldId, required },
    ...(legacyPartStyle(form.partsStyle, 'field')
      ? { style: legacyPartStyle(form.partsStyle, 'field') }
      : {}),
    children: [
      {
        id: labelNodeId,
        type: 'label',
        props: { text: label },
        ...(legacyPartStyle(form.partsStyle, 'label')
          ? { style: legacyPartStyle(form.partsStyle, 'label') }
          : {}),
        children: [],
      },
      {
        id: controlNodeId,
        type: controlType,
        props: controlProps,
        ...(legacyPartStyle(form.partsStyle, 'input')
          ? { style: legacyPartStyle(form.partsStyle, 'input') }
          : {}),
        children: [],
      },
    ],
  };
}

function migrateLegacyNode(
  node: LegacyCompositionNode,
  behaviors: OpenCompositionBehavior[],
  context?: LegacyMigrationContext,
): OpenCompositionNode {
  if (node.type === 'form') {
    const fields = Array.isArray(node.props.fields)
      ? node.props.fields.filter(
          (field): field is Record<string, unknown> =>
            typeof field === 'object' && field !== null && !Array.isArray(field),
        )
      : [];
    const formChildren = fields.map((field, index) =>
      migratedFieldNode(node, field, index, behaviors, context),
    );
    const submitNodeId = boundedCompositionId(node.id, 'submit', context?.nodeIds);
    const submitLabel =
      typeof node.props.submitLabel === 'string' ? node.props.submitLabel : 'Submit';
    formChildren.push({
      id: submitNodeId,
      type: 'button',
      props: { label: submitLabel },
      ...(legacyPartStyle(node.partsStyle, 'submit')
        ? { style: legacyPartStyle(node.partsStyle, 'submit') }
        : {}),
      children: [
        {
          id: boundedCompositionId(submitNodeId, 'text', context?.nodeIds),
          type: 'text',
          props: { text: submitLabel },
          children: [],
        },
      ],
    });
    behaviors.push({
      id: context
        ? legacyBehaviorId(submitNodeId, 'behavior', context)
        : boundedCompositionId(submitNodeId, 'behavior'),
      kind: 'action',
      nodeId: submitNodeId,
      event: 'click',
      action: 'submit-form',
      targetNodeId: node.id,
    });
    return {
      id: node.id,
      type: 'form',
      props: {
        formKey: node.id,
        successMessage:
          typeof node.props.successMessage === 'string'
            ? node.props.successMessage
            : 'Thanks — we will be in touch soon.',
      },
      ...(legacyStyle(node.style) ? { style: legacyStyle(node.style) } : {}),
      ...(node.partsStyle && typeof node.partsStyle === 'object'
        ? { partsStyle: node.partsStyle as Record<string, CompositionStyle> }
        : {}),
      children: formChildren,
    };
  }

  if (node.type === 'accordion') {
    const itemSources = node.children.filter((child) => child.type === 'accordion-item');
    const sourceItems = itemSources.length
      ? itemSources
      : [
          {
            id: boundedCompositionId(node.id, 'item', context?.nodeIds),
            type: 'accordion-item',
            props: { question: 'Question', defaultOpen: false },
            children: [],
          },
        ];
    const children = sourceItems.map((item, index) => {
      const itemId = item.id;
      const title =
        typeof item.props.title === 'string' && item.props.title.trim()
          ? item.props.title
          : `Question ${index + 1}`;
      const triggerId = boundedCompositionId(itemId, 'trigger', context?.nodeIds);
      const panelId = boundedCompositionId(itemId, 'panel', context?.nodeIds);
      const textId = boundedCompositionId(triggerId, 'text', context?.nodeIds);
      behaviors.push({
        id: context
          ? legacyBehaviorId(triggerId, 'behavior', context)
          : boundedCompositionId(triggerId, 'behavior'),
        kind: 'action',
        nodeId: triggerId,
        event: 'click',
        action: 'toggle',
        targetNodeId: panelId,
      });
      return {
        id: itemId,
        type: 'disclosure-item' as const,
        props: {
          question: title,
          defaultOpen: item.props.defaultOpen === true,
        },
        ...(legacyStyle(item.style) ? { style: legacyStyle(item.style) } : {}),
        children: [
          {
            id: triggerId,
            type: 'button' as const,
            props: { label: title },
            ...(legacyPartStyle(item.partsStyle, 'trigger')
              ? { style: legacyPartStyle(item.partsStyle, 'trigger') }
              : {}),
            children: [
              { id: textId, type: 'text' as const, props: { text: title }, children: [] },
            ],
          },
          {
            id: panelId,
            type: 'disclosure-panel' as const,
            props: {},
            ...(legacyPartStyle(item.partsStyle, 'panel')
              ? { style: legacyPartStyle(item.partsStyle, 'panel') }
              : {}),
            children: item.children.map((child) =>
              migrateLegacyNode(child, behaviors, context),
            ),
          },
        ],
      } satisfies OpenCompositionNode;
    });
    return {
      id: node.id,
      type: 'disclosure',
      props: {
        allowMultiple: node.props.allowMultiple === true,
        ...(typeof node.props.ariaLabel === 'string'
          ? { ariaLabel: node.props.ariaLabel }
          : {}),
      },
      ...(legacyStyle(node.style) ? { style: legacyStyle(node.style) } : {}),
      ...(node.partsStyle && typeof node.partsStyle === 'object'
        ? { partsStyle: node.partsStyle as Record<string, CompositionStyle> }
        : {}),
      children,
    };
  }

  if (node.type === 'tabs') {
    const tabSources = node.children.filter((child) => child.type === 'tab-item');
    const sourceItems = tabSources.length
      ? tabSources
      : [
          {
            id: boundedCompositionId(node.id, 'tab-1', context?.nodeIds),
            type: 'tab-item',
            props: { label: 'Tab 1' },
            children: [],
          },
        ];
    const listId = boundedCompositionId(node.id, 'list', context?.nodeIds);
    const triggers: OpenCompositionNode[] = [];
    const panels: OpenCompositionNode[] = [];
    sourceItems.forEach((item, index) => {
      const label =
        typeof item.props.label === 'string' && item.props.label.trim()
          ? item.props.label
          : `Tab ${index + 1}`;
      const triggerId = boundedCompositionId(item.id, 'trigger', context?.nodeIds);
      const panelId = boundedCompositionId(item.id, 'panel', context?.nodeIds);
      const textId = boundedCompositionId(triggerId, 'text', context?.nodeIds);
      behaviors.push({
        id: context
          ? legacyBehaviorId(triggerId, 'behavior', context)
          : boundedCompositionId(triggerId, 'behavior'),
        kind: 'action',
        nodeId: triggerId,
        event: 'click',
        action: 'toggle',
        targetNodeId: panelId,
      });
      triggers.push({
        id: triggerId,
        type: 'tab-trigger',
        props: { label },
        ...(legacyPartStyle(item.partsStyle, 'tab')
          ? { style: legacyPartStyle(item.partsStyle, 'tab') }
          : {}),
        children: [{ id: textId, type: 'text', props: { text: label }, children: [] }],
      });
      panels.push({
        id: panelId,
        type: 'tab-panel',
        props: {},
        ...(legacyStyle(item.style) ? { style: legacyStyle(item.style) } : {}),
        ...(legacyPartStyle(item.partsStyle, 'panel')
          ? { partsStyle: { root: legacyPartStyle(item.partsStyle, 'panel')! } }
          : {}),
        children: item.children.map((child) =>
          migrateLegacyNode(child, behaviors, context),
        ),
      });
    });
    return {
      id: node.id,
      type: 'tabs',
      props: {
        orientation: node.props.orientation === 'vertical' ? 'vertical' : 'horizontal',
        initialTabId: panels[0]?.id,
        ...(typeof node.props.ariaLabel === 'string'
          ? { ariaLabel: node.props.ariaLabel }
          : {}),
        ...(node.props.activationMode === 'manual' ||
        node.props.activationMode === 'automatic'
          ? { activationMode: node.props.activationMode }
          : {}),
      },
      ...(legacyStyle(node.style) ? { style: legacyStyle(node.style) } : {}),
      ...(node.partsStyle && typeof node.partsStyle === 'object'
        ? { partsStyle: node.partsStyle as Record<string, CompositionStyle> }
        : {}),
      children: [
        { id: listId, type: 'tab-list', props: {}, children: triggers },
        ...panels,
      ],
    };
  }

  if (node.type === 'gallery') {
    return {
      id: node.id,
      type: 'grid',
      props: {},
      ...(legacyStyle(node.style) ? { style: legacyStyle(node.style) } : {}),
      ...(node.partsStyle && typeof node.partsStyle === 'object'
        ? { partsStyle: node.partsStyle as Record<string, CompositionStyle> }
        : {}),
      children: node.children.map((child) => {
        const migrated = migrateLegacyNode(child, behaviors, context);
        if (migrated.type !== 'image') return migrated;
        const imageStyle = legacyPartStyle(node.partsStyle, 'image');
        return imageStyle && !migrated.style
          ? { ...migrated, style: imageStyle }
          : migrated;
      }),
    };
  }

  const type = OpenCompositionNodeTypeSchema.safeParse(node.type);
  if (!type.success)
    throw new Error(`Cannot migrate unsupported node type: ${node.type}`);
  return {
    id: node.id,
    type: type.data,
    props: { ...node.props },
    ...(legacyStyle(node.style) ? { style: legacyStyle(node.style) } : {}),
    ...(node.partsStyle && typeof node.partsStyle === 'object'
      ? { partsStyle: node.partsStyle as Record<string, CompositionStyle> }
      : {}),
    children: node.children.map((child) => migrateLegacyNode(child, behaviors, context)),
  };
}

/**
 * Deterministically upgrades a legacy page for editing. The input is never
 * mutated; callers persist the returned V8 payload as a new immutable version.
 */
export function migratePagePayloadToOpenComposition(
  payload: LegacyPagePayload,
): OpenCompositionPayload {
  if (payload.version < 1 || payload.version > 7) {
    throw new Error('Only legacy PagePayload versions 1 through 7 can be migrated');
  }
  const behaviors: OpenCompositionBehavior[] = [];
  const nodeIds = new Set<string>();
  const collectIds = (node: LegacyCompositionNode): void => {
    nodeIds.add(node.id);
    node.children.forEach(collectIds);
  };
  collectIds(payload.root);
  const context: LegacyMigrationContext = { nodeIds, behaviorIds: new Set<string>() };
  const root = migrateLegacyNode(payload.root, behaviors, context);
  const migrated = OpenCompositionPayloadSchema.parse({
    version: 8,
    metadata: payload.metadata,
    root,
    behaviors,
  });
  return canonicalizeOpenCompositionPayload(migrated);
}

/** Backward-compatible name for callers that explicitly migrate V7. */
export function migratePagePayloadV7ToOpenComposition(
  payload: LegacyPagePayload & { version: 7 },
): OpenCompositionPayload {
  return migratePagePayloadToOpenComposition(payload);
}

export const OpenCompositionRecipeSchema = z
  .object({
    id: compositionId,
    name: z.string().trim().min(1).max(160),
    category: z.enum(['marketing', 'conversion', 'content', 'commerce']),
    description: z.string().trim().min(1).max(500),
    document: OpenCompositionDocumentSchema,
  })
  .strict();
export type OpenCompositionRecipe = z.infer<typeof OpenCompositionRecipeSchema>;

const contactFormRecipe: OpenCompositionRecipe = {
  id: 'contact-form',
  name: 'Contact Form',
  category: 'conversion',
  description: 'A composable contact form with real editable fields and a submit action.',
  document: {
    schemaVersion: OPEN_COMPOSITION_SCHEMA_VERSION,
    root: {
      id: 'root',
      type: 'root',
      props: {},
      children: [
        {
          id: 'section',
          type: 'section',
          props: {},
          children: [
            {
              id: 'container',
              type: 'container',
              props: {},
              children: [
                {
                  id: 'heading',
                  type: 'heading',
                  props: { text: 'Contact us', level: 2 },
                  children: [],
                },
                {
                  id: 'intro',
                  type: 'text',
                  props: { text: 'Leave your information and we will get back to you.' },
                  children: [],
                },
                {
                  id: 'form',
                  type: 'form',
                  props: {
                    formKey: 'contact',
                    successMessage: 'Thanks — we will be in touch soon.',
                  },
                  children: [
                    {
                      id: 'name-field',
                      type: 'form-field',
                      props: { fieldKey: 'name', required: true },
                      children: [
                        {
                          id: 'name-label',
                          type: 'label',
                          props: { text: 'Name' },
                          children: [],
                        },
                        {
                          id: 'name-input',
                          type: 'input',
                          props: {
                            fieldKey: 'name',
                            type: 'text',
                            name: 'name',
                            placeholder: 'Your name',
                          },
                          children: [],
                        },
                      ],
                    },
                    {
                      id: 'email-field',
                      type: 'form-field',
                      props: { fieldKey: 'email', required: true },
                      children: [
                        {
                          id: 'email-label',
                          type: 'label',
                          props: { text: 'Email' },
                          children: [],
                        },
                        {
                          id: 'email-input',
                          type: 'input',
                          props: {
                            fieldKey: 'email',
                            type: 'email',
                            name: 'email',
                            placeholder: 'you@example.com',
                          },
                          children: [],
                        },
                      ],
                    },
                    {
                      id: 'message-field',
                      type: 'form-field',
                      props: { fieldKey: 'message', required: false },
                      children: [
                        {
                          id: 'message-label',
                          type: 'label',
                          props: { text: 'Message' },
                          children: [],
                        },
                        {
                          id: 'message-input',
                          type: 'textarea',
                          props: {
                            fieldKey: 'message',
                            type: 'textarea',
                            name: 'message',
                            placeholder: 'How can we help?',
                          },
                          children: [],
                        },
                      ],
                    },
                    {
                      id: 'actions',
                      type: 'row',
                      props: {},
                      children: [
                        {
                          id: 'submit',
                          type: 'button',
                          props: { label: 'Submit' },
                          children: [
                            {
                              id: 'submit-icon',
                              type: 'icon',
                              props: { name: 'arrow-right' },
                              children: [],
                            },
                            {
                              id: 'submit-text',
                              type: 'text',
                              props: { text: 'Submit' },
                              children: [],
                            },
                          ],
                        },
                        {
                          id: 'reply-note',
                          type: 'text',
                          props: { text: 'We usually reply within one business day.' },
                          children: [],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    behaviors: [
      {
        id: 'name-field-behavior',
        kind: 'field',
        nodeId: 'name-field',
        formNodeId: 'form',
        fieldKey: 'name',
        inputType: 'text',
        required: true,
        labelNodeId: 'name-label',
        controlNodeId: 'name-input',
      },
      {
        id: 'email-field-behavior',
        kind: 'field',
        nodeId: 'email-field',
        formNodeId: 'form',
        fieldKey: 'email',
        inputType: 'email',
        required: true,
        labelNodeId: 'email-label',
        controlNodeId: 'email-input',
      },
      {
        id: 'message-field-behavior',
        kind: 'field',
        nodeId: 'message-field',
        formNodeId: 'form',
        fieldKey: 'message',
        inputType: 'textarea',
        required: false,
        labelNodeId: 'message-label',
        controlNodeId: 'message-input',
      },
      {
        id: 'submit-behavior',
        kind: 'action',
        nodeId: 'submit',
        event: 'click',
        action: 'submit-form',
        targetNodeId: 'form',
      },
    ],
  },
};

function galleryRecipe(
  id: string,
  name: string,
  columns: number,
  imageCount: number,
): OpenCompositionRecipe {
  const images = Array.from({ length: imageCount }, (_, index) => ({
    id: `image-${index + 1}`,
    type: 'image' as const,
    props: {
      src: '/assets/placeholder.svg',
      alt: `Gallery image ${index + 1}`,
    },
    children: [],
  }));
  return {
    id,
    name,
    category: 'content',
    description: 'An editable image gallery made from a Grid and Image nodes.',
    document: {
      schemaVersion: OPEN_COMPOSITION_SCHEMA_VERSION,
      root: {
        id: 'root',
        type: 'root',
        props: {},
        children: [
          {
            id: 'gallery-grid',
            type: 'grid',
            props: {},
            style: {
              base: {
                display: 'grid',
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              },
            },
            children: images,
          },
        ],
      },
      behaviors: [],
    },
  };
}

export const OPEN_COMPOSITION_RECIPE_REGISTRY: readonly OpenCompositionRecipe[] = [
  contactFormRecipe,
  // One user-facing Gallery recipe owns the product entry. The historical
  // identifiers remain parseable aliases so old saved insert commands and
  // fixtures continue to resolve without rewriting existing documents.
  galleryRecipe('gallery', 'Gallery', 3, 6),
  galleryRecipe('gallery-2-columns', 'Gallery · 2 columns', 2, 4),
  galleryRecipe('gallery-3-columns', 'Gallery · 3 columns', 3, 6),
  galleryRecipe('gallery-4-columns', 'Gallery · 4 columns', 4, 8),
];

export function getOpenCompositionRecipe(id: string): OpenCompositionRecipe | undefined {
  return OPEN_COMPOSITION_RECIPE_REGISTRY.find((recipe) => recipe.id === id);
}

export type CompositionIdFactory = (sourceId: string) => string;

let fallbackIdSequence = 0;

function defaultCompositionIdFactory(sourceId: string): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return `node-${randomUuid}`;
  fallbackIdSequence += 1;
  return `${sourceId}-${fallbackIdSequence}`;
}

function remapNodeIds(
  node: OpenCompositionNode,
  map: Map<string, string>,
  createId: CompositionIdFactory,
): OpenCompositionNode {
  const id = createId(node.id);
  map.set(node.id, id);
  const children = node.children.map((child) => remapNodeIds(child, map, createId));
  const props = { ...node.props };
  if (node.type === 'tabs' && typeof props.initialTabId === 'string') {
    props.initialTabId = map.get(props.initialTabId) ?? props.initialTabId;
  }
  return {
    ...node,
    id,
    props,
    ...(node.style ? { style: { ...node.style } } : {}),
    children,
  };
}

function remapBehaviorIds(
  behavior: OpenCompositionBehavior,
  map: ReadonlyMap<string, string>,
  createId: CompositionIdFactory,
): OpenCompositionBehavior {
  if (behavior.kind === 'field') {
    return {
      id: createId(behavior.id),
      kind: 'field',
      nodeId: map.get(behavior.nodeId) ?? behavior.nodeId,
      formNodeId: map.get(behavior.formNodeId) ?? behavior.formNodeId,
      fieldKey: behavior.fieldKey,
      inputType: behavior.inputType,
      required: behavior.required,
      ...(behavior.labelNodeId
        ? { labelNodeId: map.get(behavior.labelNodeId) ?? behavior.labelNodeId }
        : {}),
      ...(behavior.controlNodeId
        ? { controlNodeId: map.get(behavior.controlNodeId) ?? behavior.controlNodeId }
        : {}),
    };
  }
  if (behavior.kind === 'action') {
    return {
      id: createId(behavior.id),
      kind: 'action',
      nodeId: map.get(behavior.nodeId) ?? behavior.nodeId,
      event: behavior.event,
      action: behavior.action,
      ...(behavior.targetNodeId
        ? { targetNodeId: map.get(behavior.targetNodeId) ?? behavior.targetNodeId }
        : {}),
    };
  }
  return {
    id: createId(behavior.id),
    kind: 'state-binding',
    nodeId: map.get(behavior.nodeId) ?? behavior.nodeId,
    property: behavior.property,
    statePath: behavior.statePath,
    ...(behavior.condition ? { condition: { ...behavior.condition } } : {}),
  };
}

/**
 * Instantiates a recipe as a detached graph. Every node and behavior gets a
 * fresh id, while semantic references continue to point at their new targets.
 */
export function instantiateOpenCompositionRecipe(
  id: string,
  createId: CompositionIdFactory = defaultCompositionIdFactory,
): OpenCompositionDocument {
  const recipe = getOpenCompositionRecipe(id);
  if (!recipe) throw new Error(`Unknown open composition recipe: ${id}`);
  const nodeIds = new Map<string, string>([['root', 'root']]);
  const root = remapNodeIds(recipe.document.root, nodeIds, (sourceId) =>
    sourceId === 'root' ? 'root' : createId(sourceId),
  );
  return OpenCompositionDocumentSchema.parse({
    schemaVersion: OPEN_COMPOSITION_SCHEMA_VERSION,
    root,
    behaviors: recipe.document.behaviors.map((behavior) =>
      remapBehaviorIds(behavior, nodeIds, createId),
    ),
  });
}

export function parseOpenCompositionDocument(input: unknown): OpenCompositionDocument {
  return OpenCompositionDocumentSchema.parse(input);
}
