import {
  PAGE_COMPONENT_REGISTRY,
  FormPropsSchema,
  PageNodeStyleSchema,
  PagePayloadSchema,
  PagePayloadV1Schema,
  CountdownPropsSchema,
  CustomExtensionNodePropsSchema,
  canContainPageComponent,
  isPageComponentType,
  type CustomExtensionNodeProps,
  type FormField,
  type FormProps,
  type PageComponentType,
  type PageNode,
  type PageNodeV2,
  type PageNodeV3,
  type PageNodeStyle,
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
export const BUILDER_COUNTDOWN_PROPS_ATTRIBUTE = 'data-payload-countdown-props';
export const BUILDER_EXTENSION_PROPS_ATTRIBUTE = 'data-payload-extension-props';
export const BUILDER_PAYLOAD_VERSION_ATTRIBUTE = 'data-payload-version';

export type BuilderViewport = 'desktop' | 'tablet' | 'mobile';
export type BuilderNode = PageNode | PageNodeV2 | PageNodeV3;
export type BuilderNodeType = PageComponentType;
export type BuilderBlockType = Exclude<BuilderNodeType, 'root'>;
type PayloadViewport = 'base' | 'tablet' | 'mobile';

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

const stylePropertyMap = {
  display: 'display',
  width: 'width',
  'max-width': 'maxWidth',
  'min-height': 'minHeight',
  padding: 'padding',
  margin: 'margin',
  gap: 'gap',
  'background-color': 'backgroundColor',
  color: 'color',
  'font-size': 'fontSize',
  'font-weight': 'fontWeight',
  'text-align': 'textAlign',
  'border-radius': 'borderRadius',
} as const;

type EditorStyleProperty = keyof typeof stylePropertyMap;

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

function formPreviewControl(field: FormField): ComponentDefinition {
  const attributes: Record<string, string> = {
    [BUILDER_FORM_PREVIEW_ATTRIBUTE]: 'control',
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
          ...(field.placeholder
            ? [
                {
                  tagName: 'option',
                  content: field.placeholder,
                  attributes: { disabled: 'disabled' },
                },
              ]
            : []),
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
                { tagName: 'span', content: option.label },
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
  if (field.type === 'checkbox') {
    return editorOnlyPreview(
      {
        tagName: 'label',
        components: [
          formPreviewControl(field),
          { tagName: 'span', content: field.label },
        ],
      },
      'field',
    );
  }

  if (field.type === 'radio') {
    return editorOnlyPreview(
      {
        tagName: 'fieldset',
        components: [
          { tagName: 'legend', content: field.label },
          formPreviewControl(field),
        ],
      },
      'field',
    );
  }

  return editorOnlyPreview(
    {
      tagName: 'label',
      components: [{ tagName: 'span', content: field.label }, formPreviewControl(field)],
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
      ['text', 'image', 'button'].includes(childType)
    );
  }
  return canContainNode(parentType, childType);
}

function payloadViewport(viewport: BuilderViewport): PayloadViewport {
  return viewport === 'desktop' ? 'base' : viewport;
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
    const editorProperty = Object.entries(stylePropertyMap).find(
      ([, payloadProperty]) => payloadProperty === property,
    )?.[0];
    result[editorProperty ?? property] = value;
  }
  return result;
}

function editorStyleToPayloadStyle(
  style: Record<string, unknown>,
  path: string[],
): PageNodeStyle['base'] {
  const payloadStyle: Record<string, unknown> = {};

  for (const [property, value] of Object.entries(style)) {
    if (!(property in stylePropertyMap)) {
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
    payloadStyle[stylePropertyMap[property as EditorStyleProperty]] = value;
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

  return parsed.data;
}

function attributesForNode(
  node: BuilderNode,
  metadata?: PagePayloadV1['metadata'],
  payloadVersion: 1 | 2 | 3 = 1,
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
  if (node.type === 'root') {
    attributes[BUILDER_PAYLOAD_VERSION_ATTRIBUTE] = String(payloadVersion);
  }

  return attributes;
}

function componentDefinitionForNode(
  node: BuilderNode,
  metadata?: PagePayloadV1['metadata'],
  payloadVersion: 1 | 2 | 3 = 1,
): ComponentDefinition {
  const attributes = attributesForNode(node, metadata, payloadVersion);
  const shared: ComponentDefinition = {
    type: node.type === 'text' ? 'text' : node.type === 'image' ? 'image' : 'default',
    tagName: PAGE_COMPONENT_REGISTRY[node.type].editorTagName,
    name: PAGE_COMPONENT_REGISTRY[node.type].label,
    attributes,
    droppable:
      node.type === 'root' || node.type === 'section' || node.type === 'container'
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
        content: node.props.label,
        attributes: {
          ...attributes,
          [BUILDER_COUNTDOWN_PROPS_ATTRIBUTE]: jsonAttribute(node.props),
        },
      };
    case 'extension':
      return {
        ...shared,
        tagName: 'div',
        content: node.props.extensionId,
        attributes: {
          ...attributes,
          [BUILDER_EXTENSION_PROPS_ATTRIBUTE]: jsonAttribute(node.props),
        },
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
  }
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

function readNodeStyle(
  snapshot: BuilderEditorSnapshot,
  path: string[],
): PageNodeStyle | undefined {
  const responsive = parseResponsiveStyle(
    snapshot.attributes[BUILDER_RESPONSIVE_STYLE_ATTRIBUTE],
    [...path, BUILDER_RESPONSIVE_STYLE_ATTRIBUTE],
  );
  const baseFromEditor = editorStyleToPayloadStyle(snapshot.style, path);

  if (!responsive && Object.keys(baseFromEditor).length === 0) {
    return undefined;
  }

  const result: PageNodeStyle = responsive ?? { base: {} };
  if (Object.keys(baseFromEditor).length > 0 || !responsive) {
    result.base = baseFromEditor;
  }
  return result;
}

function nodeFromSnapshot(
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
    if (snapshot.children.length > 0) {
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

  const children = snapshot.children.map((child, index) =>
    nodeFromSnapshot(child, [...path, 'children', String(index)]),
  );

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
          text: snapshot.content,
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
          label: snapshot.content,
          href: readStringAttribute(snapshot.attributes, 'href', path),
          target: readStringAttribute(snapshot.attributes, 'target', path),
        },
      };
  }
}

export function serializeEditorSnapshot(snapshot: BuilderEditorSnapshot): PagePayload {
  const root = nodeFromSnapshot(snapshot, ['root']);
  const versionValue = snapshot.attributes[BUILDER_PAYLOAD_VERSION_ATTRIBUTE];
  const version =
    versionValue === '3' ||
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

export function captureEditorViewportStyle(
  component: Component,
  viewport: BuilderViewport,
): void {
  const payloadViewportKey = payloadViewport(viewport);
  const current = readEditorResponsiveStyle(component) ?? { base: {} };
  current[payloadViewportKey] = editorStyleToPayloadStyle({ ...component.getStyle() }, [
    'component',
    BUILDER_RESPONSIVE_STYLE_ATTRIBUTE,
  ]);
  const hasStyle = Object.values(current).some(
    (block) => block && Object.keys(block).length > 0,
  );

  if (hasStyle) {
    component.setAttributes({
      ...component.getAttributes({ noStyle: true }),
      [BUILDER_RESPONSIVE_STYLE_ATTRIBUTE]: jsonAttribute(current),
    });
  } else {
    component.removeAttributes(BUILDER_RESPONSIVE_STYLE_ATTRIBUTE);
  }
}

export function applyEditorViewportStyle(
  component: Component,
  viewport: BuilderViewport,
): void {
  const responsive = readEditorResponsiveStyle(component);
  component.setStyle(
    styleBlockToEditorStyle(responsive?.[payloadViewport(viewport)] ?? {}),
  );
}

export function updateEditorViewportStyle(
  component: Component,
  viewport: BuilderViewport,
  property: string,
  value: string,
): void {
  if (!(property in stylePropertyMap)) {
    throw new BuilderAdapterError(`Unsupported editor style property "${property}"`);
  }
  captureEditorViewportStyle(component, viewport);
  const payloadViewportKey = payloadViewport(viewport);
  const current = readEditorResponsiveStyle(component) ?? { base: {} };
  const payloadProperty = stylePropertyMap[property as EditorStyleProperty];
  const nextBlock = {
    ...(current[payloadViewportKey] ?? {}),
    [payloadProperty]: value,
  };
  if (value.trim() === '') {
    delete nextBlock[payloadProperty as keyof typeof nextBlock];
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
  component.setStyle(styleBlockToEditorStyle(parsed.data[payloadViewportKey] ?? {}));
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
