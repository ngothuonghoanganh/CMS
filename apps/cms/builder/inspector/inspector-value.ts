import {
  PAGE_STYLE_PROPERTY_BY_EDITOR_KEY,
  type PageNodeStyle,
} from '@payload/contracts';

import type { BuilderViewport } from '../builder-adapter';

/** The value shown by an Inspector control for a responsive property. */
export type ResolvedInspectorValue = {
  /** Value authored directly at the active viewport, when one exists. */
  authoredValue?: string;
  /** Value that is effective after the desktop → tablet → mobile cascade. */
  effectiveValue?: string;
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
  style: PageNodeStyle | undefined,
  property: string,
  viewport: BuilderViewport,
): ResolvedInspectorValue {
  const definition =
    PAGE_STYLE_PROPERTY_BY_EDITOR_KEY[
      property as keyof typeof PAGE_STYLE_PROPERTY_BY_EDITOR_KEY
    ];
  const payloadKey = definition?.payloadKey ?? property;
  const activeKey = viewport === 'desktop' ? 'base' : viewport;
  const authoredBlock = style?.[activeKey];
  const authoredValue = authoredBlock?.[payloadKey as keyof typeof authoredBlock];

  const candidates: Array<{ viewport: BuilderViewport; value: string | undefined }> =
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

  const source = candidates.find(({ value }) => typeof value === 'string');
  return {
    ...(typeof authoredValue === 'string' ? { authoredValue } : {}),
    ...(source && typeof source.value === 'string'
      ? { effectiveValue: source.value, sourceViewport: source.viewport }
      : {}),
    inherited:
      viewport !== 'desktop' &&
      typeof source?.value === 'string' &&
      source.viewport !== viewport,
  };
}
