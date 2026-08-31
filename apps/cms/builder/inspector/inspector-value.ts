import {
  PAGE_STYLE_PROPERTY_BY_EDITOR_KEY,
  resolvePageStyleValue,
  type PageNodeStyle,
  type PageNodeStyleV7,
  type SiteDesignSystem,
  type StyleTokenReference,
} from '@payload/contracts';

import type { BuilderViewport } from '../builder-adapter';

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
  style: PageNodeStyle | PageNodeStyleV7 | undefined,
  property: string,
  viewport: BuilderViewport,
  designSystem?: SiteDesignSystem,
): ResolvedInspectorValue {
  const definition =
    PAGE_STYLE_PROPERTY_BY_EDITOR_KEY[
      property as keyof typeof PAGE_STYLE_PROPERTY_BY_EDITOR_KEY
    ];
  const payloadKey = definition?.payloadKey ?? property;
  const activeKey = viewport === 'desktop' ? 'base' : viewport;
  const authoredBlock = style?.[activeKey];
  const authoredValue = authoredBlock?.[payloadKey as keyof typeof authoredBlock];

  const candidates: Array<{
    viewport: BuilderViewport;
    value: string | StyleTokenReference | undefined;
  }> =
    viewport === 'desktop'
      ? [
          {
            viewport: 'desktop',
            value: style?.base?.[payloadKey as keyof typeof style.base],
          },
        ]
      : viewport === 'tablet'
        ? [
            {
              viewport: 'tablet',
              value:
                style?.tablet?.[payloadKey as keyof NonNullable<typeof style.tablet>],
            },
            {
              viewport: 'desktop',
              value: style?.base?.[payloadKey as keyof typeof style.base],
            },
          ]
        : [
            {
              viewport: 'mobile',
              value:
                style?.mobile?.[payloadKey as keyof NonNullable<typeof style.mobile>],
            },
            {
              viewport: 'tablet',
              value:
                style?.tablet?.[payloadKey as keyof NonNullable<typeof style.tablet>],
            },
            {
              viewport: 'desktop',
              value: style?.base?.[payloadKey as keyof typeof style.base],
            },
          ];

  const isStyleValue = (
    value: string | StyleTokenReference | undefined,
  ): value is string | StyleTokenReference =>
    typeof value === 'string' ||
    (typeof value === 'object' && value !== null && value.kind === 'token');
  const source = candidates.find(({ value }) => isStyleValue(value));
  const sourceValue = source?.value;
  const effectiveValue = isStyleValue(sourceValue)
    ? resolvePageStyleValue(sourceValue, designSystem, payloadKey)
    : undefined;
  const authoredStyleValue = isStyleValue(authoredValue) ? authoredValue : undefined;
  return {
    ...(authoredStyleValue !== undefined ? { authoredValue: authoredStyleValue } : {}),
    ...(source && effectiveValue !== undefined
      ? { effectiveValue, sourceViewport: source.viewport }
      : {}),
    ...(typeof sourceValue === 'object' && isStyleValue(sourceValue)
      ? { effectiveRawValue: sourceValue }
      : {}),
    inherited:
      viewport !== 'desktop' && source !== undefined && source.viewport !== viewport,
  };
}
