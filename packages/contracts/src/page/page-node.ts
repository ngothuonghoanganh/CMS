import { z } from 'zod';

import { isSafePageStyleValue, PAGE_STYLE_PROPERTY_DEFINITIONS } from '../style-registry';

/**
 * Stable identity for a canonical node. Node ids are intentionally not UUIDs:
 * a builder may keep a human-readable id stable while a node moves in the
 * tree, but the value must remain safe to address in a document.
 */
export const PageNodeIdV1Schema = z
  .string()
  .min(1, 'A page node id is required')
  .max(128)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/, 'Page node ids must be stable URL-safe names');
export type PageNodeIdV1 = z.infer<typeof PageNodeIdV1Schema>;

/**
 * This is the deliberately small component vocabulary for the first
 * canonical authoring contract. Extension, collection, reusable and site
 * global nodes stay at the compatibility boundary until their ownership is
 * explicitly modelled in the core product.
 */
export const PageComponentTypeV1Schema = z.enum([
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
  'divider',
  'list',
  'video',
  'quote',
  'accordion',
  'accordion-item',
  'tabs',
  'tab-item',
  'gallery',
]);
export type PageComponentTypeV1 = z.infer<typeof PageComponentTypeV1Schema>;

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

type JsonPrimitive = null | boolean | number | string;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

/**
 * Props are a JSON boundary, not an editor state bag. Component definitions
 * own the meaning of individual keys; the canonical contract only guarantees
 * that props are serializable and cannot carry known editor-only structures.
 */
export const PageNodePropsV1Schema = z
  .record(z.string().trim().min(1).max(128), jsonValueSchema)
  .superRefine((props, context) => {
    const forbiddenKeys = new Set([
      'behaviors',
      'editorState',
      'grapesjs',
      'metadata',
      'partsStyle',
      'reactState',
    ]);

    const visit = (value: JsonValue, path: (string | number)[]): void => {
      if (Array.isArray(value)) {
        value.forEach((item, index) => visit(item, [...path, index]));
        return;
      }
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        if (forbiddenKeys.has(key)) {
          context.addIssue({
            code: 'custom',
            path: [...path, key],
            message: `Editor-only prop ${key} is not allowed in PageCompositionV1`,
          });
        }
        visit(child, [...path, key]);
      }
    };

    visit(props, ['props']);
  });

export type PageNodePropsV1 = z.infer<typeof PageNodePropsV1Schema>;

export const PageStyleTokenReferenceV1Schema = z
  .object({
    kind: z.literal('token'),
    tokenId: PageNodeIdV1Schema,
  })
  .strict();
export type PageStyleTokenReferenceV1 = z.infer<typeof PageStyleTokenReferenceV1Schema>;

const pageStyleValueV1Schema = z.union([
  z
    .string()
    .trim()
    .min(1)
    .max(2_048)
    .refine(isSafePageStyleValue, 'Style value contains unsafe CSS'),
  PageStyleTokenReferenceV1Schema,
]);

const canonicalStylePropertyKeys = new Set(
  PAGE_STYLE_PROPERTY_DEFINITIONS.map((property) => property.payloadKey),
);

const pageStyleBlockV1Schema = z
  .record(z.string().trim().min(1).max(120), pageStyleValueV1Schema)
  .superRefine((styleBlock, context) => {
    for (const property of Object.keys(styleBlock)) {
      if (!canonicalStylePropertyKeys.has(property)) {
        context.addIssue({
          code: 'custom',
          path: [property],
          message: `Unsupported PageCompositionV1 style property: ${property}`,
        });
      }
    }
  });

/** Responsive values are content-facing style tokens, not canvas metadata. */
export const PageNodeStyleV1Schema = z
  .object({
    base: pageStyleBlockV1Schema,
    tablet: pageStyleBlockV1Schema.optional(),
    mobile: pageStyleBlockV1Schema.optional(),
  })
  .strict();
export type PageNodeStyleV1 = z.infer<typeof PageNodeStyleV1Schema>;

export type PageNodeV1 = {
  id: PageNodeIdV1;
  type: PageComponentTypeV1;
  props: PageNodePropsV1;
  style?: PageNodeStyleV1 | undefined;
  children: PageNodeV1[];
};

export const PAGE_COMPOSITION_COMPONENTS_V1 = {
  root: ['section', 'container', 'stack', 'row', 'grid', 'card'],
  section: [
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
    'divider',
    'list',
    'video',
    'quote',
    'accordion',
    'tabs',
    'gallery',
  ],
  container: [
    'section',
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
    'divider',
    'list',
    'video',
    'quote',
    'accordion',
    'tabs',
    'gallery',
  ],
  stack: [
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
    'divider',
    'list',
    'video',
    'quote',
    'accordion',
    'tabs',
    'gallery',
  ],
  row: [
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
    'divider',
    'list',
    'video',
    'quote',
    'accordion',
    'tabs',
    'gallery',
  ],
  grid: [
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
    'divider',
    'list',
    'video',
    'quote',
    'accordion',
    'tabs',
    'gallery',
  ],
  card: [
    'section',
    'container',
    'stack',
    'row',
    'grid',
    'text',
    'heading',
    'image',
    'icon',
    'button',
    'link',
    'form',
    'divider',
    'list',
    'video',
    'quote',
    'accordion',
    'tabs',
    'gallery',
  ],
  text: [],
  heading: [],
  image: [],
  icon: [],
  button: [],
  link: [],
  form: ['form-field', 'button'],
  'form-field': ['label', 'input', 'textarea', 'select'],
  label: [],
  input: [],
  textarea: [],
  select: [],
  divider: [],
  list: [],
  video: [],
  quote: [],
  accordion: ['accordion-item'],
  'accordion-item': [
    'container',
    'stack',
    'row',
    'grid',
    'text',
    'heading',
    'image',
    'button',
    'link',
  ],
  tabs: ['tab-item'],
  'tab-item': [
    'container',
    'stack',
    'row',
    'grid',
    'text',
    'heading',
    'image',
    'button',
    'link',
  ],
  gallery: ['image'],
} as const satisfies Record<PageComponentTypeV1, readonly PageComponentTypeV1[]>;

export function isPageComponentTypeV1(value: unknown): value is PageComponentTypeV1 {
  return PageComponentTypeV1Schema.safeParse(value).success;
}

export function canContainPageComponentV1(
  parentType: PageComponentTypeV1,
  childType: PageComponentTypeV1,
): boolean {
  return (
    PAGE_COMPOSITION_COMPONENTS_V1[parentType] as readonly PageComponentTypeV1[]
  ).includes(childType);
}

const pageNodeV1Schema: z.ZodType<PageNodeV1> = z.lazy(() =>
  z
    .object({
      id: PageNodeIdV1Schema,
      type: PageComponentTypeV1Schema,
      props: PageNodePropsV1Schema,
      style: PageNodeStyleV1Schema.optional(),
      children: z.array(pageNodeV1Schema).max(200),
    })
    .strict(),
);

export const PageNodeV1Schema = pageNodeV1Schema;
