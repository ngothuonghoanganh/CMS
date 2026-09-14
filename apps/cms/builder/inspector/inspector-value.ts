import {
  PAGE_STYLE_PROPERTY_BY_EDITOR_KEY,
  resolveEffectiveNodeAppearance,
  resolvePageStyleValue,
  type ResponsiveStyleSource,
  type PageNodeStyle,
  type PageNodeStyleV7,
  type SiteDesignSystem,
  type StyleTokenReference,
} from '@payload/contracts';

import type { BuilderViewport } from '../builder-block/builder-adapter';

/** The value shown by an Inspector control for a responsive property. */
export type ResolvedInspectorValue = {
  /** Value authored directly at the active viewport, when one exists. */
  authoredValue?: string | StyleTokenReference;
  /** Value that is effective after the desktop → tablet → mobile cascade. */
  effectiveValue?: string;
  /** The persisted value supplying the effective value, including token refs. */
  effectiveRawValue?: string | StyleTokenReference;
  /** Whether the effective value comes from an ancestor viewport. */
  inherited: boolean;
  /** Viewport that supplied the effective value. */
  sourceViewport?: BuilderViewport;
};

/**
 * Resolve one Inspector property in exactly the same order as the renderer's
 * responsive cascade. Controls display `effectiveValue`, while reset/override
 * affordances use `authoredValue` to distinguish inherited values.
 */
export function resolveInspectorStyleValue(
  style: ResponsiveStyleSource | PageNodeStyle | PageNodeStyleV7 | undefined,
  property: string,
  viewport: BuilderViewport,
  designSystem?: SiteDesignSystem,
  context?: {
    type?: string | undefined;
    props?: Record<string, unknown> | undefined;
    part?: string | undefined;
  },
): ResolvedInspectorValue {
  const definition =
    PAGE_STYLE_PROPERTY_BY_EDITOR_KEY[
      property as keyof typeof PAGE_STYLE_PROPERTY_BY_EDITOR_KEY
    ];
  const payloadKey = definition?.payloadKey ?? property;
  const activeKey = viewport === 'desktop' ? 'base' : viewport;
  const sourceStyle = style as ResponsiveStyleSource | undefined;
  const valueAt = (
    key: 'base' | 'tablet' | 'mobile',
  ): string | StyleTokenReference | undefined => {
    const value = sourceStyle?.[key]?.[payloadKey];
    return typeof value === 'string' ||
      (typeof value === 'object' &&
        value !== null &&
        'kind' in value &&
        value.kind === 'token')
      ? (value as string | StyleTokenReference)
      : undefined;
  };
  const authoredValue = valueAt(activeKey);

  const candidates: Array<{
    viewport: BuilderViewport;
    value: string | StyleTokenReference | undefined;
  }> =
    viewport === 'desktop'
      ? [
          {
            viewport: 'desktop',
            value: valueAt('base'),
          },
        ]
      : viewport === 'tablet'
        ? [
            {
              viewport: 'tablet',
              value: valueAt('tablet'),
            },
            {
              viewport: 'desktop',
              value: valueAt('base'),
            },
          ]
        : [
            {
              viewport: 'mobile',
              value: valueAt('mobile'),
            },
            {
              viewport: 'tablet',
              value: valueAt('tablet'),
            },
            {
              viewport: 'desktop',
              value: valueAt('base'),
            },
          ];

  const isStyleValue = (value: unknown): value is string | StyleTokenReference =>
    typeof value === 'string' ||
    (typeof value === 'object' &&
      value !== null &&
      'kind' in value &&
      value.kind === 'token');
  const source = candidates.find(({ value }) => isStyleValue(value));
  const sourceValue = source?.value;
  const effectiveBlock = context?.type
    ? resolveEffectiveNodeAppearance(
        designSystem,
        { type: context.type, props: context.props, part: context.part },
        style,
        viewport === 'desktop' ? 'base' : viewport,
      )
    : undefined;
  const effectiveRawValue = effectiveBlock?.[payloadKey];
  const effectiveCandidate = isStyleValue(effectiveRawValue)
    ? effectiveRawValue
    : sourceValue;
  const effectiveValue = isStyleValue(effectiveCandidate)
    ? resolvePageStyleValue(effectiveCandidate, designSystem, payloadKey)
    : undefined;
  const authoredStyleValue = isStyleValue(authoredValue) ? authoredValue : undefined;
  return {
    ...(authoredStyleValue !== undefined ? { authoredValue: authoredStyleValue } : {}),
    ...(effectiveValue !== undefined
      ? {
          effectiveValue,
          ...(source ? { sourceViewport: source.viewport } : {}),
        }
      : {}),
    ...(typeof effectiveCandidate === 'object' && isStyleValue(effectiveCandidate)
      ? { effectiveRawValue: effectiveCandidate }
      : {}),
    inherited:
      viewport !== 'desktop' && source !== undefined && source.viewport !== viewport,
  };
}
