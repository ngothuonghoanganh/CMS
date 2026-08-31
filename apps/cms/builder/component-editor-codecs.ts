import type { Component } from 'grapesjs';
import {
  AccordionItemPropsSchema,
  AccordionPropsSchema,
  AccordionPropsV6Schema,
  CountdownPropsSchema,
  FormPropsSchema,
  ListPropsSchema,
  PAGE_COMPONENT_REGISTRY,
  QuotePropsSchema,
  TabItemPropsSchema,
  TabsPropsSchema,
  TabsPropsV6Schema,
  VideoPropsSchema,
  GlobalHeaderPropsSchema,
  GlobalFooterPropsSchema,
  NavigationViewPropsSchema,
  SiteBrandPropsSchema,
  type FormProps,
  type PageComponentType,
  type PageNodeStyle,
} from '@payload/contracts';
import {
  resolveEditorPropertyUpdate,
  type EditorPropertyUpdate,
} from './component-editor-bindings';

import {
  BUILDER_COMPOUND_PROPS_ATTRIBUTE,
  BUILDER_GLOBAL_PROPS_ATTRIBUTE,
  BUILDER_COUNTDOWN_PROPS_ATTRIBUTE,
  BUILDER_FORM_PROPS_ATTRIBUTE,
  BUILDER_HEADING_LEVEL_ATTRIBUTE,
  BUILDER_LIST_PROPS_ATTRIBUTE,
  BUILDER_QUOTE_PROPS_ATTRIBUTE,
  BUILDER_TEXT_ALIGN_ATTRIBUTE,
  BUILDER_NODE_ID_ATTRIBUTE,
  BUILDER_NODE_TYPE_ATTRIBUTE,
  BUILDER_NODE_SLOT_ATTRIBUTE,
  readEditorPartsStyle,
  readEditorResponsiveStyle,
  sanitizeInlineText,
  listPreviewComponents,
  formPreviewComponents,
  quotePreviewComponents,
} from './builder-adapter';

export type ComponentSelectionSnapshot = {
  id: string;
  type: PageComponentType;
  props: Record<string, unknown>;
  children: Array<{ id: string; type: PageComponentType; label: string; slot?: string }>;
  text?: string;
  label?: string;
  href?: string;
  target?: '_self' | '_blank';
  src?: string;
  alt?: string;
  align?: 'left' | 'center' | 'right';
  style?: PageNodeStyle;
  partsStyle?: Record<string, PageNodeStyle>;
  form?: FormProps;
  countdown?: { targetAt: string; label: string };
};

export type ComponentEditorCodec = {
  readProps: (
    component: Component,
    type: PageComponentType,
    content: string,
  ) => {
    props: Record<string, unknown>;
    form?: FormProps;
    countdown?: { targetAt: string; label: string };
  };
  resolvePropertyMutation: (
    type: PageComponentType,
    property: string,
    value: unknown,
    component?: Component,
  ) => EditorPropertyUpdate | null;
};

function parsedJson<T>(
  raw: unknown,
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
): T | undefined {
  if (typeof raw !== 'string') return undefined;
  try {
    const result = schema.safeParse(JSON.parse(raw) as unknown);
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

type ComponentPropsReadResult = {
  props: Record<string, unknown>;
  form?: FormProps;
  countdown?: { targetAt: string; label: string };
};

type ComponentPropsReader = (
  attributes: Record<string, string>,
  content: string,
) => ComponentPropsReadResult;

const emptyPropsReader: ComponentPropsReader = () => ({ props: {} });
const jsonPropsReader =
  <T extends Record<string, unknown>>(
    attribute: string,
    schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
  ): ComponentPropsReader =>
  (attributes) => ({ props: parsedJson(attributes[attribute], schema) ?? {} });

const componentPropsReaders: Partial<Record<PageComponentType, ComponentPropsReader>> = {
  root: emptyPropsReader,
  section: emptyPropsReader,
  container: emptyPropsReader,
  divider: emptyPropsReader,
  gallery: emptyPropsReader,
  text: (_attributes, content) => ({ props: { text: content } }),
  heading: (attributes, content) => {
    const level = Number(attributes[BUILDER_HEADING_LEVEL_ATTRIBUTE]);
    return { props: { text: content, level: Number.isInteger(level) ? level : 2 } };
  },
  button: (attributes, content) => ({
    props: {
      label: content,
      href: attributes.href ?? '#',
      target: attributes.target === '_blank' ? '_blank' : '_self',
    },
  }),
  link: (attributes, content) => ({
    props: {
      text: content,
      href: attributes.href ?? '/',
      target: attributes.target === '_blank' ? '_blank' : '_self',
    },
  }),
  image: (attributes) => ({
    props: { src: attributes.src ?? '', alt: attributes.alt ?? '' },
  }),
  video: (attributes) => {
    const parsed = VideoPropsSchema.safeParse({
      src: attributes.src,
      ...(attributes.poster ? { poster: attributes.poster } : {}),
      controls: attributes.controls === 'true',
      autoplay: attributes.autoplay === 'true',
      muted: attributes.muted === 'true',
      loop: attributes.loop === 'true',
      playsInline: attributes.playsinline === 'true',
    });
    return { props: parsed.success ? parsed.data : {} };
  },
  form: (attributes) => {
    const form = parsedJson(attributes[BUILDER_FORM_PROPS_ATTRIBUTE], FormPropsSchema);
    return form ? { props: form, form } : { props: {} };
  },
  countdown: (attributes) => {
    const countdown = parsedJson(
      attributes[BUILDER_COUNTDOWN_PROPS_ATTRIBUTE],
      CountdownPropsSchema,
    );
    return countdown ? { props: countdown, countdown } : { props: {} };
  },
  list: jsonPropsReader(BUILDER_LIST_PROPS_ATTRIBUTE, ListPropsSchema),
  quote: jsonPropsReader(BUILDER_QUOTE_PROPS_ATTRIBUTE, QuotePropsSchema),
  accordion: (attributes) => ({
    props:
      parsedJson(attributes[BUILDER_COMPOUND_PROPS_ATTRIBUTE], AccordionPropsV6Schema) ??
      parsedJson(attributes[BUILDER_COMPOUND_PROPS_ATTRIBUTE], AccordionPropsSchema) ??
      {},
  }),
  'accordion-item': jsonPropsReader(
    BUILDER_COMPOUND_PROPS_ATTRIBUTE,
    AccordionItemPropsSchema,
  ),
  tabs: (attributes) => ({
    props:
      parsedJson(attributes[BUILDER_COMPOUND_PROPS_ATTRIBUTE], TabsPropsV6Schema) ??
      parsedJson(attributes[BUILDER_COMPOUND_PROPS_ATTRIBUTE], TabsPropsSchema) ??
      {},
  }),
  'tab-item': jsonPropsReader(BUILDER_COMPOUND_PROPS_ATTRIBUTE, TabItemPropsSchema),
  'global-header': jsonPropsReader(
    BUILDER_GLOBAL_PROPS_ATTRIBUTE,
    GlobalHeaderPropsSchema,
  ),
  'global-footer': jsonPropsReader(
    BUILDER_GLOBAL_PROPS_ATTRIBUTE,
    GlobalFooterPropsSchema,
  ),
  'navigation-view': jsonPropsReader(
    BUILDER_GLOBAL_PROPS_ATTRIBUTE,
    NavigationViewPropsSchema,
  ),
  'site-brand': jsonPropsReader(BUILDER_GLOBAL_PROPS_ATTRIBUTE, SiteBrandPropsSchema),
};

function readComponentPropsFromAttributes(
  component: Component,
  type: PageComponentType,
  content: string,
): ComponentPropsReadResult {
  const reader = componentPropsReaders[type] ?? emptyPropsReader;
  return reader(component.getAttributes({ noStyle: true }), content);
}

const genericCodec: ComponentEditorCodec = {
  readProps: readComponentPropsFromAttributes,
  resolvePropertyMutation: (type, property, value) =>
    resolveEditorPropertyUpdate(type, property, value),
};

const listCodec: ComponentEditorCodec = {
  ...genericCodec,
  resolvePropertyMutation: (type, property, value, component) => {
    if (property !== 'ordered' || !component || typeof value !== 'boolean') {
      return genericCodec.resolvePropertyMutation(type, property, value, component);
    }
    const current = parsedJson(
      component.getAttributes({ noStyle: true })[BUILDER_LIST_PROPS_ATTRIBUTE],
      ListPropsSchema,
    );
    return current
      ? resolveEditorPropertyUpdate(type, 'items', { ...current, ordered: value })
      : null;
  },
};

const countdownCodec: ComponentEditorCodec = {
  ...genericCodec,
  resolvePropertyMutation: (type, property, value, component) => {
    if (
      (property !== 'label' && property !== 'targetAt') ||
      !component ||
      typeof value !== 'string'
    ) {
      return genericCodec.resolvePropertyMutation(type, property, value, component);
    }
    const current = parsedJson(
      component.getAttributes({ noStyle: true })[BUILDER_COUNTDOWN_PROPS_ATTRIBUTE],
      CountdownPropsSchema,
    );
    return current
      ? resolveEditorPropertyUpdate(type, property, { ...current, [property]: value })
      : null;
  },
};

/**
 * Component semantics are registered here. Most components intentionally use
 * the generic schema/binding path; a future component can add a codec without
 * changing the Inspector or command executor.
 */
const semanticCodec: ComponentEditorCodec = {
  ...genericCodec,
  resolvePropertyMutation: (type, property, value) =>
    resolveEditorPropertyUpdate(type, property, value),
};

// Semantic components keep named codec entries even while they share the
// common schema/binding path. Each entry is an intentional extension point for
// component-specific validation or editor preview behavior.
const quoteCodec: ComponentEditorCodec = { ...semanticCodec };
const accordionCodec: ComponentEditorCodec = { ...semanticCodec };
const accordionItemCodec: ComponentEditorCodec = { ...semanticCodec };
const tabsCodec: ComponentEditorCodec = { ...semanticCodec };
const tabItemCodec: ComponentEditorCodec = { ...semanticCodec };
const globalHeaderCodec: ComponentEditorCodec = { ...semanticCodec };
const globalFooterCodec: ComponentEditorCodec = { ...semanticCodec };
const navigationViewCodec: ComponentEditorCodec = { ...semanticCodec };
const siteBrandCodec: ComponentEditorCodec = { ...semanticCodec };

export const COMPONENT_EDITOR_CODECS: Readonly<
  Record<PageComponentType, ComponentEditorCodec>
> = {
  root: genericCodec,
  section: genericCodec,
  container: genericCodec,
  text: genericCodec,
  image: genericCodec,
  button: genericCodec,
  form: genericCodec,
  countdown: countdownCodec,
  extension: genericCodec,
  heading: genericCodec,
  link: genericCodec,
  divider: genericCodec,
  list: listCodec,
  video: genericCodec,
  quote: quoteCodec,
  accordion: accordionCodec,
  'accordion-item': accordionItemCodec,
  tabs: tabsCodec,
  'tab-item': tabItemCodec,
  gallery: genericCodec,
  'global-header': globalHeaderCodec,
  'global-footer': globalFooterCodec,
  'navigation-view': navigationViewCodec,
  'site-brand': siteBrandCodec,
};

export function getComponentEditorCodec(type: PageComponentType): ComponentEditorCodec {
  return COMPONENT_EDITOR_CODECS[type] ?? genericCodec;
}

export function readComponentProps(
  component: Component,
  type: PageComponentType,
  content: string,
): ReturnType<ComponentEditorCodec['readProps']> {
  return getComponentEditorCodec(type).readProps(component, type, content);
}

const semanticAttributeByType: Partial<Record<PageComponentType, string>> = {
  quote: BUILDER_QUOTE_PROPS_ATTRIBUTE,
  accordion: BUILDER_COMPOUND_PROPS_ATTRIBUTE,
  'accordion-item': BUILDER_COMPOUND_PROPS_ATTRIBUTE,
  tabs: BUILDER_COMPOUND_PROPS_ATTRIBUTE,
  'tab-item': BUILDER_COMPOUND_PROPS_ATTRIBUTE,
  'global-header': BUILDER_GLOBAL_PROPS_ATTRIBUTE,
  'global-footer': BUILDER_GLOBAL_PROPS_ATTRIBUTE,
  'navigation-view': BUILDER_GLOBAL_PROPS_ATTRIBUTE,
  'site-brand': BUILDER_GLOBAL_PROPS_ATTRIBUTE,
};

const semanticSchemaByType: Partial<
  Record<
    PageComponentType,
    Array<{ safeParse: (value: unknown) => { success: boolean; data?: unknown } }>
  >
> = {
  quote: [QuotePropsSchema],
  accordion: [AccordionPropsV6Schema, AccordionPropsSchema],
  'accordion-item': [AccordionItemPropsSchema],
  tabs: [TabsPropsV6Schema, TabsPropsSchema],
  'tab-item': [TabItemPropsSchema],
  'global-header': [GlobalHeaderPropsSchema],
  'global-footer': [GlobalFooterPropsSchema],
  'navigation-view': [NavigationViewPropsSchema],
  'site-brand': [SiteBrandPropsSchema],
};

function applyEditorSemanticPatch(
  component: Component,
  type: PageComponentType,
  update: Extract<EditorPropertyUpdate, { kind: 'attributes' }>,
): boolean {
  const propertyPatch = update.semanticPropsPatch;
  const attributeName = semanticAttributeByType[type];
  const schemas = semanticSchemaByType[type];
  if (!propertyPatch || !attributeName || !schemas) return false;
  const raw = component.getAttributes({ noStyle: true })[attributeName];
  if (typeof raw !== 'string') return false;
  let current: unknown;
  try {
    current = JSON.parse(raw) as unknown;
  } catch {
    return false;
  }
  const v6OnlyProperty =
    (type === 'accordion' &&
      ['headingLevel', 'ariaLabel'].includes(propertyPatch.property)) ||
    (type === 'tabs' && ['ariaLabel', 'activationMode'].includes(propertyPatch.property));
  const schema = v6OnlyProperty
    ? schemas[0]
    : schemas.find((candidate) => candidate.safeParse(current).success);
  if (!schema) return false;
  let parsed = schema.safeParse(current);
  if (!parsed.success && v6OnlyProperty) {
    const legacySchema = schemas[schemas.length - 1];
    if (!legacySchema) return false;
    const legacy = legacySchema.safeParse(current);
    if (legacy.success && legacy.data && typeof legacy.data === 'object') {
      const defaults =
        type === 'accordion'
          ? { headingLevel: 3, ariaLabel: 'Accordion' }
          : { ariaLabel: 'Tabs', activationMode: 'automatic' };
      parsed = schema.safeParse({ ...defaults, ...legacy.data });
    }
  }
  if (!parsed.success || !parsed.data || typeof parsed.data !== 'object') return false;
  const next = schema.safeParse({
    ...parsed.data,
    [propertyPatch.property]: propertyPatch.value,
  });
  if (!next.success) return false;
  const nextData = next.data as Record<string, unknown>;
  component.setAttributes({
    ...component.getAttributes({ noStyle: true }),
    [attributeName]: JSON.stringify(nextData),
  });
  if (
    type === 'accordion-item' &&
    propertyPatch.property === 'defaultOpen' &&
    nextData.defaultOpen === true
  ) {
    normalizeSingleOpenAccordion(component);
  }
  if (type === 'quote') {
    component.components(
      quotePreviewComponents(next.data as { text: string; cite?: string }),
    );
  } else if (type === 'accordion-item' && typeof nextData.title === 'string') {
    component.set('content', nextData.title);
  } else if (type === 'tab-item' && typeof nextData.label === 'string') {
    component.set('content', nextData.label);
  }
  return true;
}

/**
 * A single Inspector action owns this whole transition: when an accordion is
 * single-open, opening one item closes all other open siblings before the
 * command returns. The siblings are model mutations, never independent UI
 * state, so serialization and undo observe one coherent semantic result.
 */
function normalizeSingleOpenAccordion(item: Component): void {
  const parent = item.parent();
  if (!parent) return;
  const parentType = parent.getAttributes({ noStyle: true })[BUILDER_NODE_TYPE_ATTRIBUTE];
  if (parentType !== 'accordion') return;
  const raw = parent.getAttributes({ noStyle: true })[BUILDER_COMPOUND_PROPS_ATTRIBUTE];
  const props =
    parsedJson(raw, AccordionPropsV6Schema) ?? parsedJson(raw, AccordionPropsSchema);
  if (!props || props.allowMultiple) return;
  parent.components().models.forEach((sibling) => {
    if (sibling === item) return;
    const type = sibling.getAttributes({ noStyle: true })[BUILDER_NODE_TYPE_ATTRIBUTE];
    if (type !== 'accordion-item') return;
    const siblingAttributes = sibling.getAttributes({ noStyle: true });
    const siblingProps = parsedJson(
      siblingAttributes[BUILDER_COMPOUND_PROPS_ATTRIBUTE],
      AccordionItemPropsSchema,
    );
    if (!siblingProps?.defaultOpen) return;
    sibling.setAttributes({
      ...siblingAttributes,
      [BUILDER_COMPOUND_PROPS_ATTRIBUTE]: JSON.stringify({
        ...siblingProps,
        defaultOpen: false,
      }),
    });
  });
}

export function applyEditorPropertyUpdate(
  component: Component,
  type: PageComponentType,
  update: EditorPropertyUpdate,
): boolean {
  if (update.kind === 'attributes' && update.semanticPropsPatch) {
    return applyEditorSemanticPatch(component, type, update);
  }
  if (update.kind === 'content') {
    component.set('content', update.value);
    return true;
  }
  component.setAttributes({
    ...component.getAttributes({ noStyle: true }),
    ...update.attributes,
  });
  if (update.tagName) component.set('tagName', update.tagName);
  if (update.listProps) {
    component.set('tagName', update.listProps.ordered ? 'ol' : 'ul');
    component.components(listPreviewComponents(update.listProps));
  }
  if (update.formProps) component.components(formPreviewComponents(update.formProps));
  if (update.countdownProps) component.components([]);
  return true;
}

export function selectionFromComponentCodec(
  component: Component | undefined,
): ComponentSelectionSnapshot | null {
  if (!component) return null;
  const attributes = component.getAttributes({ noStyle: true });
  const type = attributes[BUILDER_NODE_TYPE_ATTRIBUTE];
  const id = attributes[BUILDER_NODE_ID_ATTRIBUTE];
  if (
    typeof type !== 'string' ||
    !Object.prototype.hasOwnProperty.call(PAGE_COMPONENT_REGISTRY, type) ||
    typeof id !== 'string'
  ) {
    return null;
  }
  const componentType = type as PageComponentType;
  const content = sanitizeInlineText(
    component.getEl()?.textContent ?? String(component.get('content') ?? ''),
  );
  const { props, form, countdown } = readComponentProps(
    component,
    componentType,
    content,
  );
  const responsiveStyle = readEditorResponsiveStyle(component);
  const partsStyle = readEditorPartsStyle(component, componentType);
  const styleAlign = responsiveStyle?.base.textAlign;
  const legacyAlign = attributes[BUILDER_TEXT_ALIGN_ATTRIBUTE];
  const align = styleAlign ?? legacyAlign;
  const children = component.components().models.flatMap((child) => {
    const childAttributes = child.getAttributes({ noStyle: true });
    const childType = childAttributes[BUILDER_NODE_TYPE_ATTRIBUTE];
    const childId = childAttributes[BUILDER_NODE_ID_ATTRIBUTE];
    if (
      typeof childType !== 'string' ||
      !Object.prototype.hasOwnProperty.call(PAGE_COMPONENT_REGISTRY, childType) ||
      typeof childId !== 'string'
    )
      return [];
    let label = PAGE_COMPONENT_REGISTRY[childType as PageComponentType].label;
    const childProps = parsedJson<Record<string, unknown>>(
      childAttributes[BUILDER_COMPOUND_PROPS_ATTRIBUTE],
      {
        safeParse: (value) => ({
          success: typeof value === 'object' && value !== null,
          data: value as Record<string, unknown>,
        }),
      },
    );
    if (typeof childProps?.title === 'string') label = `${label}: ${childProps.title}`;
    if (typeof childProps?.label === 'string') label = `${label}: ${childProps.label}`;
    const slot = childAttributes[BUILDER_NODE_SLOT_ATTRIBUTE];
    return [
      {
        id: childId,
        type: childType as PageComponentType,
        label,
        ...(typeof slot === 'string' ? { slot } : {}),
      },
    ];
  });
  return {
    id,
    type: componentType,
    props,
    children,
    ...(type === 'text' ? { text: content } : {}),
    ...(type === 'button' ? { label: content } : {}),
    ...(type === 'image' && typeof attributes.src === 'string'
      ? {
          src: attributes.src,
          alt: typeof attributes.alt === 'string' ? attributes.alt : '',
        }
      : {}),
    ...(type === 'link' && typeof attributes.href === 'string'
      ? {
          href: attributes.href,
          target: attributes.target === '_blank' ? '_blank' : '_self',
        }
      : {}),
    ...(align === 'left' || align === 'center' || align === 'right' ? { align } : {}),
    ...(responsiveStyle ? { style: responsiveStyle } : {}),
    ...(partsStyle ? { partsStyle } : {}),
    ...(form ? { form } : {}),
    ...(countdown ? { countdown } : {}),
  };
}
