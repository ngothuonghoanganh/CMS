import { z } from 'zod';

import * as contracts from '../index';
import type { PagePayload } from '../index';
import {
  parsePageCompositionV1,
  type PageCompositionV1,
} from '../composition/page-composition';
import { canonicalizeOpenCompositionPayload } from '../open-composition-semantic-integrity';
import {
  PageComponentTypeV1Schema,
  PageNodePropsV1Schema,
  PageNodeStyleV1Schema,
  type PageNodeV1,
  type PageNodeStyleV1,
} from '../page/page-node';

/** The only legacy document shape accepted by the compatibility boundary. */
export const LegacyPageDocumentSchema = z.lazy(() => contracts.PagePayloadSchema);
export type LegacyPageDocument = PagePayload;

/**
 * Compatibility parser for active legacy flows. It is kept separate from the
 * adapter below because current Builder/Renderer records still need their
 * historical payload features while new authoring data uses PageCompositionV1.
 */
export function safeParseLegacyPageDocument(input: unknown) {
  return contracts.PagePayloadSchema.safeParse(input);
}

export function parseLegacyPageDocument(input: unknown): LegacyPageDocument {
  const parsed = contracts.PagePayloadSchema.parse(input);
  return parsed.version === 8 ? canonicalizeOpenCompositionPayload(parsed) : parsed;
}

export type LegacyPageMetadata = {
  documentTitle: string;
  documentDescription?: string;
};

export type LegacyPageAdapterResult = {
  sourceVersion: LegacyPageDocument['version'];
  metadata: LegacyPageMetadata;
  composition: PageCompositionV1;
};

export class LegacyPageAdapterError extends Error {
  constructor(
    readonly code: 'LEGACY_PAGE_DOCUMENT_INVALID' | 'UNSUPPORTED_LEGACY_FEATURE',
    message: string,
    readonly path: readonly (string | number)[] = [],
  ) {
    super(message);
    this.name = 'LegacyPageAdapterError';
  }
}

type LegacyNode = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  style?: unknown;
  partsStyle?: unknown;
  children: LegacyNode[];
};

const unsupportedLegacyNodeTypes = new Set([
  'collection-item',
  'collection-list',
  'countdown',
  'extension',
  'global-footer',
  'global-header',
  'navigation-view',
  'reusable-instance',
  'site-brand',
]);

/**
 * Converts a validated legacy document once, at the boundary. Page metadata
 * is returned separately because document title/description belong to Page/SEO,
 * not to the canonical composition tree.
 */
export function adaptLegacyPageDocument(input: unknown): LegacyPageAdapterResult {
  const parsed = contracts.PagePayloadSchema.safeParse(input);
  if (!parsed.success) {
    throw new LegacyPageAdapterError(
      'LEGACY_PAGE_DOCUMENT_INVALID',
      formatLegacyParseError(parsed.error),
    );
  }

  const payload = parsed.data;
  const behaviorRefs = legacyBehaviorRefs(payload);
  const composition = parsePageCompositionV1({
    version: 1,
    root: adaptLegacyNode(payload.root, ['root']),
    settings: {},
    ...(behaviorRefs ? { behaviorRefs } : {}),
  });

  return {
    sourceVersion: payload.version,
    metadata: {
      documentTitle: payload.metadata.documentTitle,
      ...(payload.metadata.documentDescription
        ? { documentDescription: payload.metadata.documentDescription }
        : {}),
    },
    composition,
  };
}

function adaptLegacyNode(
  value: LegacyNode,
  path: readonly (string | number)[],
): PageNodeV1 {
  if (unsupportedLegacyNodeTypes.has(value.type)) {
    throw unsupportedFeature(value.type, path);
  }

  if (!PageComponentTypeV1Schema.safeParse(value.type).success) {
    throw unsupportedFeature(value.type, path);
  }

  if (value.partsStyle !== undefined && hasEntries(value.partsStyle)) {
    throw unsupportedFeature('component-part-style', [...path, 'partsStyle']);
  }

  if (value.type === 'form' && 'fields' in value.props) {
    throw unsupportedFeature('inline-form-fields', [...path, 'props', 'fields']);
  }

  const style = adaptStyle(value.style, [...path, 'style']);
  const children = value.children.map((child, index) =>
    adaptLegacyNode(child, [...path, 'children', index]),
  );
  let props;
  try {
    props = PageNodePropsV1Schema.parse(cloneJsonRecord(value.props));
  } catch {
    throw unsupportedFeature('editor-only-props', [...path, 'props']);
  }

  return {
    id: value.id,
    type: value.type as PageNodeV1['type'],
    props,
    ...(style ? { style } : {}),
    children,
  };
}

function adaptStyle(
  value: unknown,
  path: readonly (string | number)[],
): PageNodeStyleV1 | undefined {
  if (value === undefined) return undefined;
  const parsed = z
    .object({
      base: z.record(z.string(), z.unknown()),
      tablet: z.record(z.string(), z.unknown()).optional(),
      mobile: z.record(z.string(), z.unknown()).optional(),
    })
    .strict()
    .safeParse(value);
  if (!parsed.success) throw unsupportedFeature('unsupported-style', path);

  try {
    return PageNodeStyleV1Schema.parse({
      base: cloneJsonRecord(parsed.data.base),
      ...(parsed.data.tablet ? { tablet: cloneJsonRecord(parsed.data.tablet) } : {}),
      ...(parsed.data.mobile ? { mobile: cloneJsonRecord(parsed.data.mobile) } : {}),
    });
  } catch {
    throw unsupportedFeature('unsupported-style', path);
  }
}

function legacyBehaviorRefs(
  payload: LegacyPageDocument,
): PageCompositionV1['behaviorRefs'] | undefined {
  if (payload.version !== 8) return undefined;
  const behaviors = (payload as { behaviors?: unknown }).behaviors;
  if (!Array.isArray(behaviors) || behaviors.length === 0) return undefined;
  throw unsupportedFeature('legacy-behaviors', ['behaviors']);
}

function cloneJsonRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function hasEntries(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && Object.keys(value).length > 0);
}

function unsupportedFeature(
  feature: string,
  path: readonly (string | number)[],
): LegacyPageAdapterError {
  return new LegacyPageAdapterError(
    'UNSUPPORTED_LEGACY_FEATURE',
    `Legacy page feature ${feature} cannot be represented by PageCompositionV1`,
    path,
  );
}

function formatLegacyParseError(error: z.ZodError): string {
  const details = error.issues
    .map((issue) => `${issue.path.join('.') || 'document'}: ${issue.message}`)
    .join('; ');
  return `Legacy page document is invalid: ${details}`;
}
