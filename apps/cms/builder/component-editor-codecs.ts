import type { Component } from 'grapesjs';
import {
  AccordionItemPropsSchema,
  AccordionPropsSchema,
  CountdownPropsSchema,
  FormPropsSchema,
  ListPropsSchema,
  PAGE_COMPONENT_REGISTRY,
  QuotePropsSchema,
  TabItemPropsSchema,
  TabsPropsSchema,
  VideoPropsSchema,
  type FormProps,
  type PageComponentType,
  type PageNodeStyle,
} from '@payload/contracts';

import {
  BUILDER_COMPOUND_PROPS_ATTRIBUTE,
  BUILDER_COUNTDOWN_PROPS_ATTRIBUTE,
  BUILDER_FORM_PROPS_ATTRIBUTE,
  BUILDER_HEADING_LEVEL_ATTRIBUTE,
  BUILDER_LIST_PROPS_ATTRIBUTE,
  BUILDER_QUOTE_PROPS_ATTRIBUTE,
  BUILDER_TEXT_ALIGN_ATTRIBUTE,
  BUILDER_NODE_ID_ATTRIBUTE,
  BUILDER_NODE_TYPE_ATTRIBUTE,
  readEditorResponsiveStyle,
  sanitizeInlineText,
} from './builder-adapter';

export type ComponentSelectionSnapshot = {
  id: string;
  type: PageComponentType;
  props: Record<string, unknown>;
  children: Array<{ id: string; type: PageComponentType; label: string }>;
  text?: string;
  label?: string;
  href?: string;
  target?: '_self' | '_blank';
  src?: string;
  alt?: string;
  align?: 'left' | 'center' | 'right';
  style?: PageNodeStyle;
  form?: FormProps;
  countdown?: { targetAt: string; label: string };
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

export function readComponentProps(
  component: Component,
  type: PageComponentType,
  content: string,
): {
  props: Record<string, unknown>;
  form?: FormProps;
  countdown?: { targetAt: string; label: string };
} {
  const attributes = component.getAttributes({ noStyle: true });
  const props: Record<string, unknown> = {};
  const form = parsedJson(attributes[BUILDER_FORM_PROPS_ATTRIBUTE], FormPropsSchema);
  const countdown = parsedJson(
    attributes[BUILDER_COUNTDOWN_PROPS_ATTRIBUTE],
    CountdownPropsSchema,
  );

  if (type === 'form' && form) return { props: form, form };
  if (type === 'countdown' && countdown) return { props: countdown, countdown };

  if (type === 'list') {
    const value = parsedJson(attributes[BUILDER_LIST_PROPS_ATTRIBUTE], ListPropsSchema);
    return { props: value ?? {} };
  }
  if (type === 'video') {
    const value = VideoPropsSchema.safeParse({
      src: attributes.src,
      ...(typeof attributes.poster === 'string' ? { poster: attributes.poster } : {}),
      controls: attributes.controls === 'true',
      autoplay: attributes.autoplay === 'true',
      muted: attributes.muted === 'true',
      loop: attributes.loop === 'true',
      playsInline: attributes.playsinline === 'true',
    });
    return { props: value.success ? value.data : {} };
  }
  if (type === 'quote') {
    return {
      props:
        parsedJson(attributes[BUILDER_QUOTE_PROPS_ATTRIBUTE], QuotePropsSchema) ?? {},
    };
  }
  if (type === 'accordion') {
    return {
      props:
        parsedJson(attributes[BUILDER_COMPOUND_PROPS_ATTRIBUTE], AccordionPropsSchema) ??
        {},
    };
  }
  if (type === 'accordion-item') {
    return {
      props:
        parsedJson(
          attributes[BUILDER_COMPOUND_PROPS_ATTRIBUTE],
          AccordionItemPropsSchema,
        ) ?? {},
    };
  }
  if (type === 'tabs') {
    return {
      props:
        parsedJson(attributes[BUILDER_COMPOUND_PROPS_ATTRIBUTE], TabsPropsSchema) ?? {},
    };
  }
  if (type === 'tab-item') {
    return {
      props:
        parsedJson(attributes[BUILDER_COMPOUND_PROPS_ATTRIBUTE], TabItemPropsSchema) ??
        {},
    };
  }
  if (type === 'heading') {
    const level = Number(attributes[BUILDER_HEADING_LEVEL_ATTRIBUTE]);
    return { props: { text: content, level: Number.isInteger(level) ? level : 2 } };
  }
  if (type === 'link') {
    return {
      props: {
        text: content,
        href: typeof attributes.href === 'string' ? attributes.href : '/',
        target: attributes.target === '_blank' ? '_blank' : '_self',
      },
    };
  }
  if (type === 'text') return { props: { text: content } };
  if (type === 'button') {
    return {
      props: {
        label: content,
        href: typeof attributes.href === 'string' ? attributes.href : '#',
        target: attributes.target === '_blank' ? '_blank' : '_self',
      },
    };
  }
  if (type === 'image') {
    return {
      props: {
        src: typeof attributes.src === 'string' ? attributes.src : '',
        alt: typeof attributes.alt === 'string' ? attributes.alt : '',
      },
    };
  }
  return { props };
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
    return [{ id: childId, type: childType as PageComponentType, label }];
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
    ...(form ? { form } : {}),
    ...(countdown ? { countdown } : {}),
  };
}
