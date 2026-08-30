import {
  PAGE_COMPONENT_REGISTRY,
  HeadingPropsSchema,
  FormPropsSchema,
  CountdownPropsSchema,
  ListPropsSchema,
  isSafePageHref,
  isSafePageImageSource,
  isSafePageVideoSource,
  type ListProps,
  type FormProps,
  type PageComponentType,
} from '@payload/contracts';

import {
  BUILDER_HEADING_LEVEL_ATTRIBUTE,
  BUILDER_FORM_PROPS_ATTRIBUTE,
  BUILDER_COUNTDOWN_PROPS_ATTRIBUTE,
  BUILDER_LIST_PROPS_ATTRIBUTE,
  sanitizeInlineText,
} from './builder-adapter';
import type { EditorCommand } from './editor-commands';

/** The intentionally small set of editor operations understood by the command bus. */
export type EditorPropertyUpdate =
  | { kind: 'content'; value: string }
  | {
      kind: 'attributes';
      attributes: Record<string, string>;
      tagName?: string;
      listProps?: ListProps;
      listOrdered?: boolean;
      formProps?: FormProps;
      countdownProps?: { targetAt: string; label: string };
    };

const propertyAliases: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  text: { text: 'content' },
  button: { label: 'content', href: 'href', target: 'target' },
  image: { src: 'src', alt: 'alt' },
  heading: { text: 'content', level: BUILDER_HEADING_LEVEL_ATTRIBUTE },
  link: { text: 'content', href: 'href', target: 'target' },
  video: {
    src: 'src',
    poster: 'poster',
    controls: 'controls',
    autoplay: 'autoplay',
    muted: 'muted',
    loop: 'loop',
    playsInline: 'playsinline',
  },
};

export function propertyDefinitionFor(type: PageComponentType, property: string) {
  return PAGE_COMPONENT_REGISTRY[type].propertiesSchema.find(
    (candidate) => candidate.group === 'content' && candidate.key === property,
  );
}

function stringValue(value: unknown, property: string): string {
  if (typeof value !== 'string' || sanitizeInlineText(value).trim().length === 0) {
    throw new Error(`${property} must be non-empty text`);
  }
  return sanitizeInlineText(value);
}

function booleanValue(value: unknown, property: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${property} must be boolean`);
  return value;
}

/**
 * Resolves semantic component properties into the finite editor mutation
 * vocabulary. It deliberately does not expose arbitrary object paths.
 */
export function resolveEditorPropertyUpdate(
  type: PageComponentType,
  property: string,
  value: unknown,
): EditorPropertyUpdate | null {
  if (property === 'ordered' && type === 'list') {
    return {
      kind: 'attributes',
      attributes: {},
      listOrdered: booleanValue(value, property),
    };
  }
  if (property === 'items' && type === 'list') {
    const parsed = ListPropsSchema.parse(value);
    return {
      kind: 'attributes',
      attributes: { [BUILDER_LIST_PROPS_ATTRIBUTE]: JSON.stringify(parsed) },
      listProps: parsed,
    };
  }

  if (property === 'form' && type === 'form') {
    const parsed = FormPropsSchema.parse(value);
    return {
      kind: 'attributes',
      attributes: { [BUILDER_FORM_PROPS_ATTRIBUTE]: JSON.stringify(parsed) },
      formProps: parsed,
    };
  }

  if (type === 'countdown' && (property === 'label' || property === 'targetAt')) {
    const parsed = CountdownPropsSchema.parse(value);
    return {
      kind: 'attributes',
      attributes: { [BUILDER_COUNTDOWN_PROPS_ATTRIBUTE]: JSON.stringify(parsed) },
      countdownProps: parsed,
    };
  }

  const attribute = propertyAliases[type]?.[property];
  if (!attribute) return null;

  if (attribute === 'content') {
    return { kind: 'content', value: stringValue(value, property) };
  }

  if (type === 'heading' && property === 'level') {
    const parsed = HeadingPropsSchema.shape.level.safeParse(
      typeof value === 'string' ? Number(value) : value,
    );
    if (!parsed.success) throw new Error('Heading level must be between 1 and 6');
    return {
      kind: 'attributes',
      attributes: { [BUILDER_HEADING_LEVEL_ATTRIBUTE]: String(parsed.data) },
      tagName: `h${parsed.data}`,
    };
  }

  if ((type === 'button' || type === 'link') && property === 'href') {
    const href = stringValue(value, property);
    if (!isSafePageHref(href)) throw new Error('URL protocol or format is not allowed');
    return { kind: 'attributes', attributes: { href } };
  }

  if ((type === 'button' || type === 'link') && property === 'target') {
    if (value !== '_self' && value !== '_blank') throw new Error('Invalid link target');
    return { kind: 'attributes', attributes: { target: value } };
  }

  if (type === 'image' && property === 'src') {
    const src = stringValue(value, property);
    if (!isSafePageImageSource(src)) throw new Error('Image source is not allowed');
    return { kind: 'attributes', attributes: { src } };
  }

  if (type === 'video' && property === 'src') {
    const src = stringValue(value, property);
    if (!isSafePageVideoSource(src)) throw new Error('Video source is not allowed');
    return { kind: 'attributes', attributes: { src } };
  }

  if (type === 'video' && property === 'poster') {
    const poster = typeof value === 'string' ? value.trim() : '';
    if (poster && !isSafePageImageSource(poster)) {
      throw new Error('Poster image source is not allowed');
    }
    return { kind: 'attributes', attributes: { poster } };
  }

  if (
    type === 'video' &&
    ['controls', 'autoplay', 'muted', 'loop', 'playsInline'].includes(property)
  ) {
    const next = booleanValue(value, property);
    if (property === 'autoplay' && next) {
      // Browsers commonly block audible autoplay. The serialized contract also
      // enforces this, so make the safe behavior deterministic at edit time.
      return {
        kind: 'attributes',
        attributes: { autoplay: 'true', muted: 'true' },
      };
    }
    if (property === 'muted' && !next) {
      // Keep the serialized payload valid when a user removes the mute flag
      // from a video that is already configured for autoplay.
      return {
        kind: 'attributes',
        attributes: { muted: 'false', autoplay: 'false' },
      };
    }
    return { kind: 'attributes', attributes: { [attribute]: String(next) } };
  }

  return null;
}

export function createEditorPropertyCommand(
  nodeId: string,
  type: PageComponentType,
  property: string,
  value: unknown,
): EditorCommand | null {
  if (
    !propertyDefinitionFor(type, property) &&
    !(type === 'list' && property === 'items')
  ) {
    return null;
  }
  // Validation is repeated by the command executor against the live node. This
  // helper remains a pure binding and is safe to use from any Inspector view.
  return { kind: 'set-property', nodeId, property, value };
}
