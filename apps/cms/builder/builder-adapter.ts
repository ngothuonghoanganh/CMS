import {
  PAGE_COMPONENT_REGISTRY,
  FormPropsSchema,
  PageNodeStyleSchema,
  PagePayloadSchema,
  PagePayloadV1Schema,
  PageNodePartsStyleSchema,
  CountdownPropsSchema,
  ListPropsSchema,
  VideoPropsSchema,
  QuotePropsSchema,
  AccordionPropsSchema,
  AccordionPropsV6Schema,
  AccordionItemPropsSchema,
  TabsPropsSchema,
  TabsPropsV6Schema,
  TabItemPropsSchema,
  CustomExtensionNodePropsSchema,
  canContainPageComponent,
  isPageComponentType,
  PAGE_RESPONSIVE_BREAKPOINTS,
  PAGE_STYLE_PROPERTY_BY_EDITOR_KEY,
  PAGE_STYLE_PROPERTY_BY_PAYLOAD_KEY,
  isSafePageStyleValue,
  type CustomExtensionNodeProps,
  type FormField,
  type FormProps,
  type ListProps,
  type PageComponentType,
  type PageNode,
  type PageNodeV2,
  type PageNodeV3,
  type PageNodeV4,
  type PageNodeV5,
  type PageNodeV6,
  type PageNodeStyle,
  type PageNodePartsStyle,
  type PagePayload,
  type PagePayloadV1,
} from '@payload/contracts';
import type { Component, ComponentDefinition } from 'grapesjs';
import { builderExtensionElement } from './builder-extension-registry';

export const BUILDER_NODE_ID_ATTRIBUTE = 'data-payload-node-id';
export const BUILDER_NODE_TYPE_ATTRIBUTE = 'data-payload-node-type';
export const BUILDER_RESPONSIVE_STYLE_ATTRIBUTE = 'data-payload-responsive-style';
export const BUILDER_METADATA_ATTRIBUTE = 'data-payload-metadata';
export const BUILDER_TEXT_ALIGN_ATTRIBUTE = 'data-payload-text-align';
export const BUILDER_FORM_PROPS_ATTRIBUTE = 'data-payload-form-props';
export const BUILDER_FORM_PREVIEW_ATTRIBUTE = 'data-payload-form-preview';
export const BUILDER_RUNTIME_PREVIEW_ATTRIBUTE = 'data-payload-runtime-preview';
export const BUILDER_COUNTDOWN_PROPS_ATTRIBUTE = 'data-payload-countdown-props';
export const BUILDER_EXTENSION_PROPS_ATTRIBUTE = 'data-payload-extension-props';
export const BUILDER_PAYLOAD_VERSION_ATTRIBUTE = 'data-payload-version';
export const BUILDER_HEADING_LEVEL_ATTRIBUTE = 'data-payload-heading-level';
export const BUILDER_LIST_PROPS_ATTRIBUTE = 'data-payload-list-props';
export const BUILDER_LIST_PREVIEW_ATTRIBUTE = 'data-payload-list-preview';
export const BUILDER_QUOTE_PROPS_ATTRIBUTE = 'data-payload-quote-props';
export const BUILDER_QUOTE_PREVIEW_ATTRIBUTE = 'data-payload-quote-preview';
export const BUILDER_COMPOUND_PROPS_ATTRIBUTE = 'data-payload-compound-props';
export const BUILDER_PARTS_STYLE_ATTRIBUTE = 'data-payload-parts-style';
/** Editor-only slot ownership marker; it is intentionally omitted from payload props. */
export const BUILDER_NODE_SLOT_ATTRIBUTE = 'data-payload-slot';

export type BuilderViewport = 'desktop' | 'tablet' | 'mobile';
export type BuilderNode =
  PageNode | PageNodeV2 | PageNodeV3 | PageNodeV4 | PageNodeV5 | PageNodeV6;
export type BuilderNodeType = PageComponentType;
export type BuilderBlockType = Exclude<BuilderNodeType, 'root'>;
type PayloadViewport = 'base' | 'tablet' | 'mobile';

export function listPreviewComponents(props: ListProps): ComponentDefinition[] {
  return props.items.map((item) => ({
    tagName: 'li',
    content: sanitizeInlineText(item.text),
    attributes: {
      [BUILDER_LIST_PREVIEW_ATTRIBUTE]: 'true',
      'data-payload-list-item-id': item.id,
    },
    copyable: false,
    draggable: false,
    droppable: false,
    removable: false,
    selectable: false,
  }));
}

export type BuilderEditorSnapshot = {
  tagName: string;
  attributes: Record<string, unknown>;
  content: string;
  style: Record<string, unknown>;
  children: BuilderEditorSnapshot[];
};

export class BuilderAdapterError extends Error {
  constructor(
    message: string,
    readonly path: string[] = [],
  ) {
    super(path.length > 0 ? `${message} at ${path.join('.')}` : message);
    this.name = 'BuilderAdapterError';
  }
}

function editorOnlyPreview(
  definition: ComponentDefinition,
  kind: 'field' | 'control' | 'option' | 'submit',
): ComponentDefinition {
  return {
    ...definition,
    attributes: {
      ...(definition.attributes ?? {}),
      [BUILDER_FORM_PREVIEW_ATTRIBUTE]: kind,
    },
    copyable: false,
    draggable: false,
    droppable: false,
    removable: false,
    selectable: false,
  };
}

function editorOnlyRuntimePreview(definition: ComponentDefinition): ComponentDefinition {
  return {
    ...definition,
    attributes: {
      ...(definition.attributes ?? {}),
      [BUILDER_RUNTIME_PREVIEW_ATTRIBUTE]: 'true',
    },
    copyable: false,
    draggable: false,
    droppable: false,
    removable: false,
    selectable: false,
  };
}

function formPreviewControl(field: FormField): ComponentDefinition {
  const id = `payload-form-${field.id}`;
  const attributes: Record<string, string> = {
    [BUILDER_FORM_PREVIEW_ATTRIBUTE]: 'control',
    id,
    name: field.name,
  };
  if (field.required) attributes.required = 'required';
  if ('placeholder' in field && field.placeholder) {
    attributes.placeholder = field.placeholder;
  }

  if (field.type === 'textarea') {
    return editorOnlyPreview({ tagName: 'textarea', attributes }, 'control');
  }
  if (field.type === 'select') {
    return editorOnlyPreview(
      {
        tagName: 'select',
        attributes,
        components: [
          {
            tagName: 'option',
            content: field.placeholder || 'Select an option',
            attributes: { value: '' },
          },
          ...field.options.map((option) => ({
            tagName: 'option',
            content: option.label,
            attributes: { value: option.value },
          })),
        ],
      },
      'control',
    );
  }
  if (field.type === 'checkbox') {
    return editorOnlyPreview(
      { tagName: 'input', void: true, attributes: { ...attributes, type: 'checkbox' } },
      'control',
    );
  }
  if (field.type === 'radio') {
    return editorOnlyPreview(
      {
        tagName: 'div',
        attributes: {
          role: 'radiogroup',
          'aria-label': field.label,
        },
        components: field.options.map((option) =>
          editorOnlyPreview(
            {
              tagName: 'label',
              components: [
                {
                  tagName: 'input',
                  void: true,
                  attributes: {
                    type: 'radio',
                    name: field.name,
                    value: option.value,
                    ...(field.required ? { required: 'required' } : {}),
                  },
                },
                option.label,
              ],
            },
            'option',
          ),
        ),
      },
      'control',
    );
  }

  return editorOnlyPreview(
    {
      tagName: 'input',
      void: true,
      attributes: {
        ...attributes,
        type: field.type,
      },
    },
    'control',
  );
}

function formPreviewField(field: FormField): ComponentDefinition {
  const label = `${field.label}${field.required ? ' *' : ''}`;
  if (field.type === 'checkbox') {
    return editorOnlyPreview(
      {
        tagName: 'div',
        components: [{ tagName: 'label', content: label }, formPreviewControl(field)],
      },
      'field',
    );
  }

  if (field.type === 'radio') {
    return editorOnlyPreview(
      {
        tagName: 'div',
        components: [{ tagName: 'label', content: label }, formPreviewControl(field)],
      },
      'field',
    );
  }

  return editorOnlyPreview(
    {
      tagName: 'div',
      components: [{ tagName: 'label', content: label }, formPreviewControl(field)],
    },
    'field',
  );
}

export function formPreviewComponents(props: FormProps): ComponentDefinition[] {
  return [
    ...props.fields.map(formPreviewField),
    editorOnlyPreview(
      { tagName: 'button', content: props.submitLabel, attributes: { type: 'button' } },
      'submit',
    ),
  ];
}

export function countdownPreviewComponents(props: {
  label: string;
  targetAt: string;
}): ComponentDefinition[] {
  return [
    editorOnlyRuntimePreview({
      tagName: 'div',
      attributes: { 'data-extension-runtime': 'countdown.runtime' },
      components: [
        { tagName: 'span', content: props.label },
        { tagName: 'span', content: ' ' },
        {
          tagName: 'time',
          content: formatCountdownRemaining(props.targetAt),
          attributes: { dateTime: props.targetAt },
        },
      ],
    }),
  ];
}

export function quotePreviewComponents(props: {
  text: string;
  cite?: string | undefined;
}): ComponentDefinition[] {
  return [
    {
      tagName: 'p',
      content: sanitizeInlineText(props.text),
      attributes: { [BUILDER_QUOTE_PREVIEW_ATTRIBUTE]: 'text' },
      copyable: false,
      draggable: false,
      droppable: false,
      removable: false,
      selectable: false,
    },
    ...(props.cite?.trim()
      ? [
          {
            tagName: 'cite',
            content: sanitizeInlineText(props.cite),
            attributes: { [BUILDER_QUOTE_PREVIEW_ATTRIBUTE]: 'cite' },
            copyable: false,
            draggable: false,
            droppable: false,
            removable: false,
            selectable: false,
          },
        ]
      : []),
  ];
}

export function formatCountdownRemaining(targetAt: string, now = Date.now()): string {
  const targetTime = new Date(targetAt).getTime();
  const milliseconds = Number.isFinite(targetTime) ? Math.max(0, targetTime - now) : 0;
  const seconds = Math.floor(milliseconds / 1_000);
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return `${days}d ${hours}h ${minutes}m ${seconds % 60}s`;
}

export function isBuilderNodeType(value: unknown): value is BuilderNodeType {
  return isPageComponentType(value);
}

export function canContainNode(
  parentType: BuilderNodeType,
  childType: BuilderNodeType,
): boolean {
  return canContainPageComponent(parentType, childType);
}

function canAcceptEditorNode(
  parentType: BuilderNodeType,
  childType: BuilderNodeType,
): boolean {
  if (parentType === 'root') {
    // Leaf blocks dropped on the canvas are wrapped into a Section by the
    // editor lifecycle before serialization. This keeps an empty canvas a
    // useful drop target without broadening the persisted V1 tree.
    return (
      canContainNode(parentType, childType) ||
      PAGE_COMPONENT_REGISTRY[childType].allowedParents.includes('section')
    );
  }
  return canContainNode(parentType, childType);
}

function payloadViewport(viewport: BuilderViewport): PayloadViewport {
  return PAGE_RESPONSIVE_BREAKPOINTS[viewport].payloadKey;
}

/**
 * The editor has one inline style block per component, whereas the renderer
 * applies media rules through the normal cascade. Resolve the same cascade
 * before painting a GrapesJS device so mobile inherits tablet overrides.
 */
export function resolveViewportStyle(
  style: PageNodeStyle | undefined,
  viewport: BuilderViewport,
): PageNodeStyle['base'] {
  if (!style) return {};
  return {
    ...style.base,
    ...(viewport === 'desktop' ? {} : style.tablet),
    ...(viewport === 'mobile' ? style.mobile : {}),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonAttribute(value: unknown): string {
  return JSON.stringify(value);
}

function styleBlockToEditorStyle(style: PageNodeStyle['base']): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [property, value] of Object.entries(style)) {
    if (typeof value !== 'string') continue;
    const definition = PAGE_STYLE_PROPERTY_BY_PAYLOAD_KEY[property];
    if (definition && isSafePageStyleValue(value)) {
      result[definition.editorProperty] = value;
    }
  }
  return result;
}

function editorStyleToPayloadStyle(
  style: Record<string, unknown>,
  path: string[],
): PageNodeStyle['base'] {
  const payloadStyle: Record<string, unknown> = {};

  for (const [property, value] of Object.entries(style)) {
    const definition =
      PAGE_STYLE_PROPERTY_BY_EDITOR_KEY[
        property as keyof typeof PAGE_STYLE_PROPERTY_BY_EDITOR_KEY
      ];
    if (!definition) {
      throw new BuilderAdapterError(`Unsupported editor style property "${property}"`, [
        ...path,
        'style',
        property,
      ]);
    }
    if (typeof value !== 'string') {
      throw new BuilderAdapterError(
        `Editor style property "${property}" must be a string`,
        [...path, 'style', property],
      );
    }
    if (!isSafePageStyleValue(value)) {
      throw new BuilderAdapterError(
        `Editor style property "${property}" contains an unsafe CSS value`,
        [...path, 'style', property],
      );
    }
    payloadStyle[definition.payloadKey] = value;
  }

  const parsed = PageNodeStyleSchema.safeParse({ base: payloadStyle });
  if (!parsed.success) {
    throw new BuilderAdapterError(
      parsed.error.issues.map((issue) => issue.message).join('; '),
      [...path, 'style'],
    );
  }

  return parsed.data.base;
}

function parseResponsiveStyle(value: unknown, path: string[]): PageNodeStyle | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new BuilderAdapterError('Responsive style metadata must be JSON text', path);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(value) as unknown;
  } catch {
    throw new BuilderAdapterError('Responsive style metadata is not valid JSON', path);
  }

  const parsed = PageNodeStyleSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new BuilderAdapterError(
      parsed.error.issues.map((issue) => issue.message).join('; '),
      path,
    );
  }

  for (const [viewport, block] of Object.entries(parsed.data)) {
    for (const [property, styleValue] of Object.entries(block ?? {})) {
      if (styleValue !== undefined && !isSafePageStyleValue(styleValue)) {
        throw new BuilderAdapterError(
          `Responsive style property "${property}" contains an unsafe CSS value`,
          [...path, viewport, property],
        );
      }
    }
  }

  return parsed.data;
}

function attributesForNode(
  node: BuilderNode,
  metadata?: PagePayloadV1['metadata'],
  payloadVersion: 1 | 2 | 3 | 4 | 5 | 6 = 1,
) {
  const attributes: Record<string, string> = {
    [BUILDER_NODE_ID_ATTRIBUTE]: node.id,
    [BUILDER_NODE_TYPE_ATTRIBUTE]: node.type,
  };

  if (node.style) {
    attributes[BUILDER_RESPONSIVE_STYLE_ATTRIBUTE] = jsonAttribute(node.style);
  }
  if (metadata) {
    attributes[BUILDER_METADATA_ATTRIBUTE] = jsonAttribute(metadata);
  }
  if ('partsStyle' in node && node.partsStyle) {
    attributes[BUILDER_PARTS_STYLE_ATTRIBUTE] = jsonAttribute(node.partsStyle);
  }
  if (node.type === 'root') {
    attributes[BUILDER_PAYLOAD_VERSION_ATTRIBUTE] = String(payloadVersion);
  }

  return attributes;
}

function componentDefinitionForNode(
  node: BuilderNode,
  metadata?: PagePayloadV1['metadata'],
  payloadVersion: 1 | 2 | 3 | 4 | 5 | 6 = 1,
): ComponentDefinition {
  const attributes = attributesForNode(node, metadata, payloadVersion);
  const shared: ComponentDefinition = {
    type: node.type === 'text' ? 'text' : node.type === 'image' ? 'image' : 'default',
    tagName: PAGE_COMPONENT_REGISTRY[node.type].editorTagName,
    name: PAGE_COMPONENT_REGISTRY[node.type].label,
    attributes,
    droppable:
      PAGE_COMPONENT_REGISTRY[node.type].allowedChildren.length > 0
        ? (source: Component) => {
            const sourceType = source.getAttributes({ noStyle: true })[
              BUILDER_NODE_TYPE_ATTRIBUTE
            ];
            return (
              isBuilderNodeType(sourceType) && canAcceptEditorNode(node.type, sourceType)
            );
          }
        : false,
    // The editor uses a small iframe-aware pointer bridge and moves the real
    // GrapesJS model explicitly. Native GrapesJS drag is disabled because its
    // custom iframe sorter does not receive the parent-document coordinates
    // from this React block panel.
    draggable: false,
    removable: node.type !== 'root',
    copyable: node.type !== 'root',
    selectable: true,
    style: node.style ? styleBlockToEditorStyle(node.style.base) : undefined,
  };

  switch (node.type) {
    case 'text':
      return {
        ...shared,
        content: node.props.text,
        editable: true,
        attributes: {
          ...attributes,
          ...(node.props.align
            ? { [BUILDER_TEXT_ALIGN_ATTRIBUTE]: node.props.align }
            : {}),
        },
      };
    case 'image':
      return {
        ...shared,
        void: true,
        attributes: { ...attributes, src: node.props.src, alt: node.props.alt },
      };
    case 'button':
      return {
        ...shared,
        content: node.props.label,
        // GrapesJS provides the inline editing affordance for labels. The
        // command adapter still owns persisted updates and rejects child
        // components during serialization, so this never becomes arbitrary
        // HTML in PagePayload.
        editable: true,
        attributes: {
          ...attributes,
          href: node.props.href,
          target: node.props.target,
        },
      };
    case 'form':
      return {
        ...shared,
        tagName: 'form',
        type: 'default',
        components: formPreviewComponents(node.props),
        attributes: {
          ...attributes,
          [BUILDER_FORM_PROPS_ATTRIBUTE]: jsonAttribute(node.props),
        },
      };
    case 'countdown':
      return {
        ...shared,
        tagName: 'div',
        components: countdownPreviewComponents(node.props),
        attributes: {
          ...attributes,
          [BUILDER_COUNTDOWN_PROPS_ATTRIBUTE]: jsonAttribute(node.props),
        },
      };
    case 'extension':
      return {
        ...shared,
        tagName: 'div',
        content: 'This custom extension is unavailable.',
        attributes: {
          ...attributes,
          'aria-label': 'Unavailable custom extension',
          'data-extension': node.props.extensionId,
          [BUILDER_EXTENSION_PROPS_ATTRIBUTE]: jsonAttribute(node.props),
          role: 'note',
        },
      };
    case 'heading':
      return {
        ...shared,
        tagName: `h${node.props.level}`,
        content: node.props.text,
        editable: true,
        attributes: {
          ...attributes,
          [BUILDER_HEADING_LEVEL_ATTRIBUTE]: String(node.props.level),
        },
      };
    case 'link':
      return {
        ...shared,
        content: node.props.text,
        editable: true,
        attributes: {
          ...attributes,
          href: node.props.href,
          target: node.props.target,
        },
      };
    case 'divider':
      return { ...shared, tagName: 'hr', void: true };
    case 'list':
      return {
        ...shared,
        tagName: node.props.ordered ? 'ol' : 'ul',
        components: listPreviewComponents(node.props),
        attributes: {
          ...attributes,
          [BUILDER_LIST_PROPS_ATTRIBUTE]: jsonAttribute(node.props),
        },
      };
    case 'video':
      return {
        ...shared,
        tagName: 'video',
        void: false,
        attributes: {
          ...attributes,
          src: node.props.src,
          ...(node.props.poster ? { poster: node.props.poster } : {}),
          ...(node.props.controls ? { controls: 'true' } : { controls: 'false' }),
          ...(node.props.autoplay ? { autoplay: 'true' } : { autoplay: 'false' }),
          ...(node.props.muted ? { muted: 'true' } : { muted: 'false' }),
          ...(node.props.loop ? { loop: 'true' } : { loop: 'false' }),
          ...(node.props.playsInline
            ? { playsinline: 'true' }
            : { playsinline: 'false' }),
        },
      };
    case 'quote':
      return {
        ...shared,
        tagName: 'blockquote',
        components: quotePreviewComponents(node.props),
        attributes: {
          ...attributes,
          [BUILDER_QUOTE_PROPS_ATTRIBUTE]: jsonAttribute(node.props),
        },
      };
    case 'accordion':
      return {
        ...shared,
        tagName: 'div',
        attributes: {
          ...attributes,
          [BUILDER_COMPOUND_PROPS_ATTRIBUTE]: jsonAttribute(node.props),
        },
        components: node.children.map((child) =>
          componentDefinitionForNode(child, undefined, payloadVersion),
        ),
      };
    case 'accordion-item':
      return {
        ...shared,
        tagName: 'section',
        content: node.props.title,
        attributes: {
          ...attributes,
          [BUILDER_COMPOUND_PROPS_ATTRIBUTE]: jsonAttribute(node.props),
        },
        components: node.children.map((child) =>
          componentDefinitionForNode(child, undefined, payloadVersion),
        ),
      };
    case 'tabs':
      return {
        ...shared,
        tagName: 'div',
        attributes: {
          ...attributes,
          [BUILDER_COMPOUND_PROPS_ATTRIBUTE]: jsonAttribute(node.props),
        },
        components: node.children.map((child) =>
          componentDefinitionForNode(child, undefined, payloadVersion),
        ),
      };
    case 'tab-item':
      return {
        ...shared,
        tagName: 'section',
        content: node.props.label,
        attributes: {
          ...attributes,
          [BUILDER_COMPOUND_PROPS_ATTRIBUTE]: jsonAttribute(node.props),
        },
        components: node.children.map((child) =>
          componentDefinitionForNode(child, undefined, payloadVersion),
        ),
      };
    case 'gallery':
      return {
        ...shared,
        tagName: 'div',
        attributes,
        components: node.children.map((child) =>
          componentDefinitionForNode(child, undefined, payloadVersion),
        ),
      };
    case 'root':
    case 'section':
    case 'container':
      return {
        ...shared,
        components: node.children.map((child) =>
          componentDefinitionForNode(child, undefined, payloadVersion),
        ),
      };
  }
  throw new BuilderAdapterError('Unsupported builder node type');
}

export function payloadToEditorComponent(payload: PagePayload): ComponentDefinition {
  return componentDefinitionForNode(payload.root, payload.metadata, payload.version);
}

export function snapshotFromEditorDefinition(
  definition: ComponentDefinition,
): BuilderEditorSnapshot {
  const components = definition.components;
  const childDefinitions = Array.isArray(components)
    ? components.filter((child): child is ComponentDefinition => isObject(child))
    : isObject(components)
      ? [components as ComponentDefinition]
      : [];

  return {
    tagName: String(definition.tagName ?? ''),
    attributes: { ...(definition.attributes ?? {}) },
    content: typeof definition.content === 'string' ? definition.content : '',
    style: isObject(definition.style) ? { ...definition.style } : {},
    children: childDefinitions.map((child) => snapshotFromEditorDefinition(child)),
  };
}

function newNodeId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}-${uuid.replace(/[^A-Za-z0-9_-]/g, '')}`;
}

export function createBlockDefinition(
  type: BuilderBlockType,
  extensionId?: string,
): ComponentDefinition {
  const id = newNodeId(type);
  const baseNode = {
    id,
    children: [],
  };

  switch (type) {
    case 'section':
      return componentDefinitionForNode({ ...baseNode, type: 'section', props: {} });
    case 'container':
      return componentDefinitionForNode({ ...baseNode, type: 'container', props: {} });
    case 'text':
      return componentDefinitionForNode({
        ...baseNode,
        type: 'text',
        props: { text: 'Edit this text' },
      });
    case 'image':
      return componentDefinitionForNode({
        ...baseNode,
        type: 'image',
        props: { src: '/assets/placeholder.png', alt: 'Image' },
      });
    case 'button':
      return componentDefinitionForNode({
        ...baseNode,
        type: 'button',
        props: { label: 'Button', href: '#section', target: '_self' },
      });
    case 'form':
      return componentDefinitionForNode(
        {
          ...baseNode,
          type: 'form',
          props: {
            fields: [
              {
                id: 'name',
                type: 'text',
                label: 'Name',
                name: 'name',
                required: true,
                placeholder: 'Your name',
              },
              {
                id: 'email',
                type: 'email',
                label: 'Email',
                name: 'email',
                required: true,
                placeholder: 'you@example.com',
              },
            ],
            submitLabel: 'Submit',
            successMessage: 'Thanks — we will be in touch soon.',
          },
        },
        undefined,
        2,
      );
    case 'countdown': {
      const extension = builderExtensionElement('countdown');
      if (!extension)
        throw new BuilderAdapterError('Countdown extension is not registered');
      return componentDefinitionForNode(
        {
          ...baseNode,
          type: 'countdown',
          props: extension.defaultProps,
        },
        undefined,
        3,
      );
    }
    case 'extension': {
      if (!extensionId) {
        throw new BuilderAdapterError('Custom extension id is required');
      }
      const props: CustomExtensionNodeProps = { extensionId, values: {} };
      return componentDefinitionForNode(
        {
          ...baseNode,
          type: 'extension',
          props,
        },
        undefined,
        3,
      );
    }
    case 'heading':
      return componentDefinitionForNode(
        {
          ...baseNode,
          type: 'heading',
          props: { text: 'Heading', level: 2 },
        },
        undefined,
        4,
      );
    case 'link':
      return componentDefinitionForNode(
        {
          ...baseNode,
          type: 'link',
          props: { text: 'Learn more', href: '/', target: '_self' },
        },
        undefined,
        4,
      );
    case 'divider':
      return componentDefinitionForNode(
        { ...baseNode, type: 'divider', props: {} },
        undefined,
        4,
      );
    case 'list':
      return componentDefinitionForNode(
        {
          ...baseNode,
          type: 'list',
          props: {
            ordered: false,
            items: [
              { id: 'item-1', text: 'First item' },
              { id: 'item-2', text: 'Second item' },
            ],
          },
        },
        undefined,
        4,
      );
    case 'video':
      return componentDefinitionForNode(
        {
          ...baseNode,
          type: 'video',
          props: {
            src: '/assets/placeholder.mp4',
            controls: true,
            autoplay: false,
            muted: false,
            loop: false,
            playsInline: true,
          },
        },
        undefined,
        4,
      );
    case 'quote':
      return componentDefinitionForNode(
        {
          ...baseNode,
          type: 'quote',
          props: { text: 'A thoughtful quote', cite: '' },
        },
        undefined,
        5,
      );
    case 'accordion-item':
      return componentDefinitionForNode(
        {
          ...baseNode,
          type: 'accordion-item',
          props: { title: 'Accordion Item', defaultOpen: false },
          children: [
            {
              id: newNodeId('text'),
              type: 'text',
              props: { text: 'Edit this panel content' },
              children: [],
            },
          ],
        },
        undefined,
        5,
      );
    case 'accordion':
      return componentDefinitionForNode(
        {
          ...baseNode,
          type: 'accordion',
          props: { allowMultiple: false },
          children: [
            {
              id: newNodeId('accordion-item'),
              type: 'accordion-item',
              props: { title: 'Accordion Item 1', defaultOpen: true },
              children: [
                {
                  id: newNodeId('text'),
                  type: 'text',
                  props: { text: 'Edit this panel content' },
                  children: [],
                },
              ],
            },
            {
              id: newNodeId('accordion-item'),
              type: 'accordion-item',
              props: { title: 'Accordion Item 2', defaultOpen: false },
              children: [
                {
                  id: newNodeId('text'),
                  type: 'text',
                  props: { text: 'Edit this panel content' },
                  children: [],
                },
              ],
            },
          ],
        },
        undefined,
        5,
      );
    case 'tabs':
      return componentDefinitionForNode(
        {
          ...baseNode,
          type: 'tabs',
          props: { orientation: 'horizontal' },
          children: [
            {
              id: newNodeId('tab-item'),
              type: 'tab-item',
              props: { label: 'Tab 1' },
              children: [
                {
                  id: newNodeId('text'),
                  type: 'text',
                  props: { text: 'Edit this tab content' },
                  children: [],
                },
              ],
            },
            {
              id: newNodeId('tab-item'),
              type: 'tab-item',
              props: { label: 'Tab 2' },
              children: [
                {
                  id: newNodeId('text'),
                  type: 'text',
                  props: { text: 'Edit this tab content' },
                  children: [],
                },
              ],
            },
          ],
        },
        undefined,
        5,
      );
    case 'tab-item':
      return componentDefinitionForNode(
        {
          ...baseNode,
          type: 'tab-item',
          props: { label: 'Tab' },
          children: [
            {
              id: newNodeId('text'),
              type: 'text',
              props: { text: 'Edit this tab content' },
              children: [],
            },
          ],
        },
        undefined,
        5,
      );
    case 'gallery':
      return componentDefinitionForNode(
        {
          ...baseNode,
          type: 'gallery',
          props: {},
          style: {
            base: {
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: '16px',
            },
          },
          children: [1, 2, 3].map(() => ({
            id: newNodeId('image'),
            type: 'image' as const,
            props: { src: '/assets/placeholder.png', alt: 'Gallery image' },
            children: [],
          })),
        },
        undefined,
        5,
      );
  }
  throw new BuilderAdapterError(`Unsupported builder block type "${String(type)}"`);
}

export function createExtensionBlockDefinition(extensionId: string): ComponentDefinition {
  return createBlockDefinition('extension', extensionId);
}

function readStringAttribute(
  attributes: Record<string, unknown>,
  name: string,
  path: string[],
  required?: true,
): string;
function readStringAttribute(
  attributes: Record<string, unknown>,
  name: string,
  path: string[],
  required: false,
): string | undefined;
function readStringAttribute(
  attributes: Record<string, unknown>,
  name: string,
  path: string[],
  required = true,
): string | undefined {
  const value = attributes[name];
  if (value === undefined && !required) {
    return undefined;
  }
  if (typeof value !== 'string' || (required && value.length === 0)) {
    throw new BuilderAdapterError(`Editor attribute "${name}" is invalid`, [
      ...path,
      name,
    ]);
  }
  return value;
}

/** Keep inline labels/text plain-text only at the persistence boundary. */
export function sanitizeInlineText(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .slice(0, 20_000);
}

function isPageNodeType(value: string): value is BuilderNodeType {
  return isBuilderNodeType(value);
}

function readMetadata(attributes: Record<string, unknown>): PagePayloadV1['metadata'] {
  const raw = readStringAttribute(attributes, BUILDER_METADATA_ATTRIBUTE, ['root']);
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new BuilderAdapterError('Page metadata is not valid JSON', [
      'root',
      'metadata',
    ]);
  }
  const candidate = PagePayloadV1Schema.shape.metadata.safeParse(value);
  if (!candidate.success) {
    throw new BuilderAdapterError(
      candidate.error.issues.map((issue) => issue.message).join('; '),
      ['root', 'metadata'],
    );
  }
  return candidate.data;
}

function readFormProps(attributes: Record<string, unknown>, path: string[]): FormProps {
  const raw = readStringAttribute(attributes, BUILDER_FORM_PROPS_ATTRIBUTE, path);
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new BuilderAdapterError('Form properties are not valid JSON', [
      ...path,
      'props',
    ]);
  }
  const parsed = FormPropsSchema.safeParse(value);
  if (!parsed.success) {
    throw new BuilderAdapterError(
      parsed.error.issues.map((issue) => issue.message).join('; '),
      [...path, 'props'],
    );
  }
  return parsed.data;
}

function readCountdownProps(
  attributes: Record<string, unknown>,
  path: string[],
): { targetAt: string; label: string } {
  const raw = readStringAttribute(attributes, BUILDER_COUNTDOWN_PROPS_ATTRIBUTE, path);
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new BuilderAdapterError('Countdown properties are not valid JSON', [
      ...path,
      'props',
    ]);
  }
  const parsed = CountdownPropsSchema.safeParse(value);
  if (!parsed.success) {
    throw new BuilderAdapterError(
      parsed.error.issues.map((issue) => issue.message).join('; '),
      [...path, 'props'],
    );
  }
  return parsed.data;
}

function readJsonAttribute(
  attributes: Record<string, unknown>,
  name: string,
  path: string[],
): unknown {
  const raw = readStringAttribute(attributes, name, path);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new BuilderAdapterError(`${name} is not valid JSON`, [...path, 'props']);
  }
}

function readBooleanAttribute(
  attributes: Record<string, unknown>,
  name: string,
  path: string[],
): boolean {
  const value = readStringAttribute(attributes, name, path);
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new BuilderAdapterError(`Editor attribute "${name}" is invalid`, [...path, name]);
}

function readHeadingLevel(attributes: Record<string, unknown>, path: string[]): number {
  const raw = readStringAttribute(attributes, BUILDER_HEADING_LEVEL_ATTRIBUTE, path);
  const level = Number(raw);
  if (!Number.isInteger(level) || level < 1 || level > 6) {
    throw new BuilderAdapterError('Heading level must be between 1 and 6', [
      ...path,
      'props',
      'level',
    ]);
  }
  return level;
}

function readNodeStyle(
  snapshot: BuilderEditorSnapshot,
  path: string[],
): PageNodeStyle | undefined {
  const responsive = parseResponsiveStyle(
    snapshot.attributes[BUILDER_RESPONSIVE_STYLE_ATTRIBUTE],
    [...path, BUILDER_RESPONSIVE_STYLE_ATTRIBUTE],
  );
  const baseFromEditor = editorStyleToPayloadStyle(snapshot.style, path);

  // When responsive metadata exists, the GrapesJS style block is a painted
  // effective value for the active device (base + tablet/mobile overrides).
  // Persist the authored responsive metadata instead of accidentally copying
  // that effective presentation back into `base` during a tablet/mobile save.
  if (responsive) return responsive;
  return Object.keys(baseFromEditor).length > 0 ? { base: baseFromEditor } : undefined;
}

function nodeFromSnapshotInternal(
  snapshot: BuilderEditorSnapshot,
  path: string[],
): Record<string, unknown> {
  const id = readStringAttribute(snapshot.attributes, BUILDER_NODE_ID_ATTRIBUTE, path);
  const type = readStringAttribute(
    snapshot.attributes,
    BUILDER_NODE_TYPE_ATTRIBUTE,
    path,
  );
  const style = readNodeStyle(snapshot, path);

  if (!isPageNodeType(type)) {
    throw new BuilderAdapterError(`Unsupported editor node type "${type}"`, [
      ...path,
      'type',
    ]);
  }

  if (type === 'form') {
    const hasUnexpectedEditorChild = snapshot.children.some(
      (child) => child.attributes[BUILDER_FORM_PREVIEW_ATTRIBUTE] === undefined,
    );
    if (hasUnexpectedEditorChild) {
      throw new BuilderAdapterError(
        'Form nodes may only contain editor preview components',
        [...path, 'children'],
      );
    }
    return {
      id,
      type,
      style,
      props: readFormProps(snapshot.attributes, path),
      children: [],
    };
  }

  if (type === 'countdown') {
    const hasUnexpectedEditorChild = snapshot.children.some(
      (child) => child.attributes[BUILDER_RUNTIME_PREVIEW_ATTRIBUTE] === undefined,
    );
    if (hasUnexpectedEditorChild) {
      throw new BuilderAdapterError('Countdown nodes cannot contain editor components', [
        ...path,
        'children',
      ]);
    }
    return {
      id,
      type,
      style,
      props: readCountdownProps(snapshot.attributes, path),
      children: [],
    };
  }

  if (type === 'extension') {
    if (snapshot.children.length > 0) {
      throw new BuilderAdapterError('Extension nodes cannot contain editor components', [
        ...path,
        'children',
      ]);
    }
    let value: unknown;
    try {
      value = JSON.parse(
        readStringAttribute(snapshot.attributes, BUILDER_EXTENSION_PROPS_ATTRIBUTE, path),
      ) as unknown;
    } catch {
      throw new BuilderAdapterError('Extension properties are not valid JSON', [
        ...path,
        'props',
      ]);
    }
    const props = CustomExtensionNodePropsSchema.safeParse(value);
    if (!props.success) {
      throw new BuilderAdapterError(
        props.error.issues.map((issue) => issue.message).join('; '),
        [...path, 'props'],
      );
    }
    return { id, type, style, props: props.data, children: [] };
  }

  if (type === 'heading') {
    if (snapshot.children.length > 0) {
      throw new BuilderAdapterError('Heading nodes cannot contain editor components', [
        ...path,
        'children',
      ]);
    }
    return {
      id,
      type,
      style,
      props: {
        text: sanitizeInlineText(snapshot.content),
        level: readHeadingLevel(snapshot.attributes, path),
      },
      children: [],
    };
  }

  if (type === 'link') {
    if (snapshot.children.length > 0) {
      throw new BuilderAdapterError('Link nodes cannot contain editor components', [
        ...path,
        'children',
      ]);
    }
    return {
      id,
      type,
      style,
      props: {
        text: sanitizeInlineText(snapshot.content),
        href: readStringAttribute(snapshot.attributes, 'href', path),
        target: readStringAttribute(snapshot.attributes, 'target', path),
      },
      children: [],
    };
  }

  if (type === 'divider') {
    if (snapshot.children.length > 0) {
      throw new BuilderAdapterError('Divider nodes cannot contain editor components', [
        ...path,
        'children',
      ]);
    }
    return { id, type, style, props: {}, children: [] };
  }

  if (type === 'list') {
    const hasUnexpectedEditorChild = snapshot.children.some(
      (child) => child.attributes[BUILDER_LIST_PREVIEW_ATTRIBUTE] === undefined,
    );
    if (hasUnexpectedEditorChild) {
      throw new BuilderAdapterError('List nodes may only contain editor preview items', [
        ...path,
        'children',
      ]);
    }
    const props = ListPropsSchema.safeParse(
      readJsonAttribute(snapshot.attributes, BUILDER_LIST_PROPS_ATTRIBUTE, path),
    );
    if (!props.success) {
      throw new BuilderAdapterError(
        props.error.issues.map((issue) => issue.message).join('; '),
        [...path, 'props'],
      );
    }
    return { id, type, style, props: props.data, children: [] };
  }

  if (type === 'video') {
    if (snapshot.children.length > 0) {
      throw new BuilderAdapterError('Video nodes cannot contain editor components', [
        ...path,
        'children',
      ]);
    }
    const poster = readStringAttribute(snapshot.attributes, 'poster', path, false);
    const props = VideoPropsSchema.safeParse({
      src: readStringAttribute(snapshot.attributes, 'src', path),
      ...(poster ? { poster } : {}),
      controls: readBooleanAttribute(snapshot.attributes, 'controls', path),
      autoplay: readBooleanAttribute(snapshot.attributes, 'autoplay', path),
      muted: readBooleanAttribute(snapshot.attributes, 'muted', path),
      loop: readBooleanAttribute(snapshot.attributes, 'loop', path),
      playsInline: readBooleanAttribute(snapshot.attributes, 'playsinline', path),
    });
    if (!props.success) {
      throw new BuilderAdapterError(
        props.error.issues.map((issue) => issue.message).join('; '),
        [...path, 'props'],
      );
    }
    return { id, type, style, props: props.data, children: [] };
  }

  if (type === 'quote') {
    const hasUnexpectedEditorChild = snapshot.children.some(
      (child) => child.attributes[BUILDER_QUOTE_PREVIEW_ATTRIBUTE] === undefined,
    );
    if (hasUnexpectedEditorChild) {
      throw new BuilderAdapterError(
        'Quote nodes may only contain editor preview content',
        [...path, 'children'],
      );
    }
    const props = QuotePropsSchema.safeParse(
      readJsonAttribute(snapshot.attributes, BUILDER_QUOTE_PROPS_ATTRIBUTE, path),
    );
    if (!props.success) {
      throw new BuilderAdapterError(
        props.error.issues.map((issue) => issue.message).join('; '),
        [...path, 'props'],
      );
    }
    return { id, type, style, props: props.data, children: [] };
  }

  const children = snapshot.children.map((child, index) =>
    nodeFromSnapshot(child, [...path, 'children', String(index)]),
  );

  if (
    type === 'accordion' ||
    type === 'accordion-item' ||
    type === 'tabs' ||
    type === 'tab-item'
  ) {
    const rawProps = readJsonAttribute(
      snapshot.attributes,
      BUILDER_COMPOUND_PROPS_ATTRIBUTE,
      path,
    );
    const propsSchemas =
      type === 'accordion'
        ? [AccordionPropsV6Schema, AccordionPropsSchema]
        : type === 'accordion-item'
          ? [AccordionItemPropsSchema]
          : type === 'tabs'
            ? [TabsPropsV6Schema, TabsPropsSchema]
            : [TabItemPropsSchema];
    const propsSchema = propsSchemas.find((schema) => schema.safeParse(rawProps).success);
    if (!propsSchema) {
      throw new BuilderAdapterError('Compound component properties are invalid', [
        ...path,
        'props',
      ]);
    }
    const props = propsSchema.safeParse(rawProps);
    if (!props.success) {
      throw new BuilderAdapterError(
        props.error.issues.map((issue) => issue.message).join('; '),
        [...path, 'props'],
      );
    }
    return { id, type, style, props: props.data, children };
  }

  if (type === 'gallery') {
    return { id, type, style, props: {}, children };
  }

  const common = {
    id,
    type,
    style,
    children,
  };

  switch (type) {
    case 'root':
    case 'section':
    case 'container':
      return { ...common, props: {} };
    case 'text': {
      if (children.length > 0) {
        throw new BuilderAdapterError('Text nodes cannot contain editor components', [
          ...path,
          'children',
        ]);
      }
      const align = readStringAttribute(
        snapshot.attributes,
        BUILDER_TEXT_ALIGN_ATTRIBUTE,
        path,
        false,
      );
      return {
        ...common,
        props: {
          text: sanitizeInlineText(snapshot.content),
          ...(align ? { align } : {}),
        },
      };
    }
    case 'image':
      if (children.length > 0) {
        throw new BuilderAdapterError('Image nodes cannot contain editor components', [
          ...path,
          'children',
        ]);
      }
      return {
        ...common,
        props: {
          src: readStringAttribute(snapshot.attributes, 'src', path),
          alt: readStringAttribute(snapshot.attributes, 'alt', path) ?? '',
        },
      };
    case 'button':
      if (children.length > 0) {
        throw new BuilderAdapterError('Button nodes cannot contain editor components', [
          ...path,
          'children',
        ]);
      }
      return {
        ...common,
        props: {
          label: sanitizeInlineText(snapshot.content),
          href: readStringAttribute(snapshot.attributes, 'href', path),
          target: readStringAttribute(snapshot.attributes, 'target', path),
        },
      };
  }
  throw new BuilderAdapterError('Unsupported editor node type');
}

function readNodePartsStyle(
  snapshot: BuilderEditorSnapshot,
  type: BuilderNodeType,
  path: string[],
): Record<string, PageNodeStyle> | undefined {
  const raw = snapshot.attributes[BUILDER_PARTS_STYLE_ATTRIBUTE];
  if (raw === undefined || raw === '') return undefined;
  if (typeof raw !== 'string') {
    throw new BuilderAdapterError('Component part styles must be JSON text', path);
  }
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new BuilderAdapterError('Component part styles are not valid JSON', path);
  }
  const parsed = PageNodePartsStyleSchema.safeParse(value);
  if (!parsed.success) {
    throw new BuilderAdapterError(
      parsed.error.issues.map((issue) => issue.message).join('; '),
      [...path, 'partsStyle'],
    );
  }
  const componentParts = PAGE_COMPONENT_REGISTRY[type].componentParts;
  for (const [partName, partStyle] of Object.entries(parsed.data)) {
    const part = componentParts[partName];
    if (!part) {
      throw new BuilderAdapterError(`Unknown component part "${partName}"`, [
        ...path,
        'partsStyle',
        partName,
      ]);
    }
    if (!part) continue;
    for (const viewport of ['base', 'tablet', 'mobile'] as const) {
      for (const [property, styleValue] of Object.entries(partStyle[viewport] ?? {})) {
        if (
          !part.styleCapabilities.includes(
            PAGE_STYLE_PROPERTY_BY_PAYLOAD_KEY[property]?.key as never,
          )
        ) {
          throw new BuilderAdapterError(
            `Style property "${property}" is not allowed for ${type}.${partName}`,
            [...path, 'partsStyle', partName, viewport, property],
          );
        }
        if (typeof styleValue !== 'string' || !isSafePageStyleValue(styleValue)) {
          throw new BuilderAdapterError(
            'Component part style contains an unsafe CSS value',
            [...path, 'partsStyle', partName, viewport, property],
          );
        }
      }
    }
  }
  return parsed.data;
}

function nodeFromSnapshot(
  snapshot: BuilderEditorSnapshot,
  path: string[],
): Record<string, unknown> {
  const node = nodeFromSnapshotInternal(snapshot, path);
  const type = node.type;
  if (typeof type !== 'string' || !isPageNodeType(type)) return node;
  const partsStyle = readNodePartsStyle(snapshot, type, path);
  return partsStyle ? { ...node, partsStyle } : node;
}

export function serializeEditorSnapshot(snapshot: BuilderEditorSnapshot): PagePayload {
  const root = nodeFromSnapshot(snapshot, ['root']);
  const versionValue = snapshot.attributes[BUILDER_PAYLOAD_VERSION_ATTRIBUTE];
  const version =
    versionValue === '6' || versionValue === 6 || containsV6Node(root)
      ? 6
      : versionValue === '5' || versionValue === 5 || containsV5Node(root)
        ? 5
        : versionValue === '4' || versionValue === 4 || containsV4Node(root)
          ? 4
          : versionValue === '3' ||
              versionValue === 3 ||
              containsCountdownNode(root) ||
              containsExtensionNode(root)
            ? 3
            : versionValue === '2' || versionValue === 2 || containsFormNode(root)
              ? 2
              : 1;
  const candidate: unknown = {
    version,
    metadata: readMetadata(snapshot.attributes),
    root,
  };
  const parsed = PagePayloadSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new BuilderAdapterError(
      parsed.error.issues.map((issue) => issue.message).join('; '),
      ['payload'],
    );
  }
  return parsed.data;
}

function containsFormNode(node: Record<string, unknown>): boolean {
  if (node.type === 'form') return true;
  return (
    Array.isArray(node.children) &&
    node.children.some(
      (child): child is Record<string, unknown> =>
        isObject(child) && containsFormNode(child),
    )
  );
}

function containsCountdownNode(node: Record<string, unknown>): boolean {
  if (node.type === 'countdown') return true;
  return (
    Array.isArray(node.children) &&
    node.children.some(
      (child): child is Record<string, unknown> =>
        isObject(child) && containsCountdownNode(child),
    )
  );
}

function containsExtensionNode(node: Record<string, unknown>): boolean {
  if (node.type === 'extension') return true;
  return (
    Array.isArray(node.children) &&
    node.children.some(
      (child): child is Record<string, unknown> =>
        isObject(child) && containsExtensionNode(child),
    )
  );
}

function containsV4Node(node: Record<string, unknown>): boolean {
  if (['heading', 'link', 'divider', 'list', 'video'].includes(String(node.type))) {
    return true;
  }
  return (
    Array.isArray(node.children) &&
    node.children.some(
      (child): child is Record<string, unknown> =>
        isObject(child) && containsV4Node(child),
    )
  );
}

function containsV5Node(node: Record<string, unknown>): boolean {
  if (
    ['quote', 'accordion', 'accordion-item', 'tabs', 'tab-item', 'gallery'].includes(
      String(node.type),
    )
  ) {
    return true;
  }
  return (
    Array.isArray(node.children) &&
    node.children.some(
      (child): child is Record<string, unknown> =>
        isObject(child) && containsV5Node(child),
    )
  );
}

function containsV6Node(node: Record<string, unknown>): boolean {
  if (
    isObject(node.partsStyle) ||
    (node.type === 'accordion' &&
      isObject(node.props) &&
      ('headingLevel' in node.props || 'ariaLabel' in node.props)) ||
    (node.type === 'tabs' &&
      isObject(node.props) &&
      ('ariaLabel' in node.props || 'activationMode' in node.props))
  ) {
    return true;
  }
  return (
    Array.isArray(node.children) &&
    node.children.some(
      (child): child is Record<string, unknown> =>
        isObject(child) && containsV6Node(child),
    )
  );
}

export function snapshotFromGrapesComponent(component: Component): BuilderEditorSnapshot {
  return {
    tagName: String(component.get('tagName') ?? ''),
    attributes: { ...component.getAttributes({ noStyle: true }) },
    content: String(component.get('content') ?? ''),
    style: { ...component.getStyle() },
    children: component
      .components()
      .models.map((child) => snapshotFromGrapesComponent(child)),
  };
}

export function serializeGrapesComponent(component: Component): PagePayload {
  return serializeEditorSnapshot(snapshotFromGrapesComponent(component));
}

export function readEditorResponsiveStyle(
  component: Component,
): PageNodeStyle | undefined {
  return parseResponsiveStyle(
    component.getAttributes({ noStyle: true })[BUILDER_RESPONSIVE_STYLE_ATTRIBUTE],
    [BUILDER_RESPONSIVE_STYLE_ATTRIBUTE],
  );
}

export function readEditorPartsStyle(
  component: Component,
  type: BuilderNodeType,
): PageNodePartsStyle | undefined {
  const raw = component.getAttributes({ noStyle: true })[BUILDER_PARTS_STYLE_ATTRIBUTE];
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  try {
    const parsed = PageNodePartsStyleSchema.safeParse(JSON.parse(raw) as unknown);
    if (!parsed.success) return undefined;
    const parts = PAGE_COMPONENT_REGISTRY[type].componentParts;
    const safeEntries = Object.entries(parsed.data).flatMap(([partName, style]) => {
      const part = parts[partName];
      if (!part) return [];
      const safeStyle = Object.fromEntries(
        (['base', 'tablet', 'mobile'] as const).flatMap((viewport) => {
          const block = style[viewport];
          if (!block) return [];
          return Object.entries(block).filter(
            ([property, value]) =>
              part.styleCapabilities.includes(
                PAGE_STYLE_PROPERTY_BY_PAYLOAD_KEY[property]?.key as never,
              ) &&
              typeof value === 'string' &&
              isSafePageStyleValue(value),
          ).length > 0
            ? [
                [
                  viewport,
                  Object.fromEntries(
                    Object.entries(block).filter(
                      ([property, value]) =>
                        part.styleCapabilities.includes(
                          PAGE_STYLE_PROPERTY_BY_PAYLOAD_KEY[property]?.key as never,
                        ) &&
                        typeof value === 'string' &&
                        isSafePageStyleValue(value),
                    ),
                  ),
                ],
              ]
            : [];
        }),
      );
      return Object.keys(safeStyle).length > 0 ? [[partName, safeStyle]] : [];
    });
    return safeEntries.length > 0
      ? (Object.fromEntries(safeEntries) as PageNodePartsStyle)
      : undefined;
  } catch {
    return undefined;
  }
}

function sameStyleValues(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => left[key] === right[key]);
}

export function applyEditorViewportStyle(
  component: Component,
  viewport: BuilderViewport,
): void {
  const responsive = readEditorResponsiveStyle(component);
  const nextStyle = styleBlockToEditorStyle(resolveViewportStyle(responsive, viewport));
  const currentStyle = { ...component.getStyle() } as Record<string, unknown>;
  if (!sameStyleValues(currentStyle, nextStyle)) component.setStyle(nextStyle);
}

export function updateEditorViewportStyle(
  component: Component,
  viewport: BuilderViewport,
  property: string,
  value: string,
): boolean {
  const definition =
    PAGE_STYLE_PROPERTY_BY_EDITOR_KEY[
      property as keyof typeof PAGE_STYLE_PROPERTY_BY_EDITOR_KEY
    ];
  if (!definition) {
    throw new BuilderAdapterError(`Unsupported editor style property "${property}"`);
  }
  if (
    definition.payloadKey === 'opacity' &&
    value.trim() !== '' &&
    !/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(value.trim())
  ) {
    throw new BuilderAdapterError('Opacity must be a number between 0 and 1');
  }
  if (value.trim() !== '' && !isSafePageStyleValue(value)) {
    throw new BuilderAdapterError(
      `Editor style property "${property}" contains an unsafe CSS value`,
    );
  }
  const payloadViewportKey = payloadViewport(viewport);
  const current = readEditorResponsiveStyle(component) ?? { base: {} };
  const previousValue = (
    current[payloadViewportKey] as Record<string, string | undefined> | undefined
  )?.[definition.payloadKey];
  if ((value.trim() === '' && previousValue === undefined) || previousValue === value) {
    return false;
  }
  const nextBlock = {
    ...(current[payloadViewportKey] ?? {}),
    [definition.payloadKey]: value,
  };
  if (value.trim() === '') {
    delete nextBlock[definition.payloadKey as keyof typeof nextBlock];
  }
  current[payloadViewportKey] = nextBlock;
  const parsed = PageNodeStyleSchema.safeParse(current);
  if (!parsed.success) {
    throw new BuilderAdapterError(
      parsed.error.issues.map((issue) => issue.message).join('; '),
      ['style', property],
    );
  }
  component.setAttributes({
    ...component.getAttributes({ noStyle: true }),
    [BUILDER_RESPONSIVE_STYLE_ATTRIBUTE]: jsonAttribute(parsed.data),
  });
  component.setStyle(
    styleBlockToEditorStyle(resolveViewportStyle(parsed.data, viewport)),
  );
  return true;
}

export function updateEditorPartViewportStyle(
  component: Component,
  type: BuilderNodeType,
  partName: string,
  viewport: BuilderViewport,
  property: string,
  value: string,
): boolean {
  const part = PAGE_COMPONENT_REGISTRY[type].componentParts[partName];
  const definition =
    PAGE_STYLE_PROPERTY_BY_EDITOR_KEY[
      property as keyof typeof PAGE_STYLE_PROPERTY_BY_EDITOR_KEY
    ];
  if (!part || !definition || !part.styleCapabilities.includes(property as never)) {
    throw new BuilderAdapterError(
      `Style property "${property}" is not allowed for ${type}.${partName}`,
    );
  }
  if (
    definition.payloadKey === 'opacity' &&
    value.trim() !== '' &&
    !/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(value.trim())
  ) {
    throw new BuilderAdapterError('Opacity must be a number between 0 and 1');
  }
  if (value.trim() !== '' && !isSafePageStyleValue(value)) {
    throw new BuilderAdapterError('Component part style contains an unsafe CSS value');
  }
  const current = readEditorPartsStyle(component, type) ?? {};
  const partStyle = current[partName] ?? { base: {} };
  const viewportKey = payloadViewport(viewport);
  const nextBlock = { ...(partStyle[viewportKey] ?? {}) } as Record<string, string>;
  const previousValue = nextBlock[definition.payloadKey];
  if ((value.trim() === '' && previousValue === undefined) || previousValue === value) {
    return false;
  }
  if (value.trim() === '') delete nextBlock[definition.payloadKey];
  const nextPartStyle = { ...partStyle, [viewportKey]: nextBlock };
  const parsed = PageNodePartsStyleSchema.safeParse({
    ...current,
    [partName]: nextPartStyle,
  });
  if (!parsed.success) {
    throw new BuilderAdapterError(
      parsed.error.issues.map((issue) => issue.message).join('; '),
      ['partsStyle', partName, property],
    );
  }
  component.setAttributes({
    ...component.getAttributes({ noStyle: true }),
    [BUILDER_PARTS_STYLE_ATTRIBUTE]: jsonAttribute(parsed.data),
  });
  return true;
}

export function reassignEditorNodeIds(component: Component): void {
  component.onAll((current) => {
    const attributes = current.getAttributes({ noStyle: true });
    if (attributes[BUILDER_NODE_ID_ATTRIBUTE]) {
      current.setAttributes({
        ...attributes,
        [BUILDER_NODE_ID_ATTRIBUTE]: newNodeId('copy'),
      });
    }
  });
}
