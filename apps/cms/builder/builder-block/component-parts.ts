import {
  PAGE_COMPONENT_REGISTRY,
  type ComponentPartDefinition,
  type PageComponentType,
  isPageComponentType,
} from '@payload/contracts';

/** A transient Layers selection. An omitted part targets the block's own style. */
export type BuilderStyleTarget = {
  nodeId: string;
  partName?: string | undefined;
};

export type BuilderStyleTargetDefinition = {
  label: string;
  partName?: string | undefined;
};

/**
 * Returns the visual sub-elements that can be styled without changing the
 * content tree. The root is intentionally excluded: it is already represented
 * by the persisted builder node and its normal Style inspector.
 */
export function styleableComponentParts(
  type: string,
): readonly ComponentPartDefinition[] {
  if (!isPageComponentType(type)) return [];
  return Object.values(PAGE_COMPONENT_REGISTRY[type].componentParts).filter(
    (part) => part.name !== 'root' && part.styleCapabilities.length > 0,
  );
}

/**
 * Every builder block gets an explicit Block target, which opens its normal
 * Style inspector. Components with visual internals append their real
 * `partsStyle` targets after it. This keeps the content tree unchanged while
 * making the available style scope discoverable from Layers.
 */
export function styleTargetsForComponent(
  type: string,
): readonly BuilderStyleTargetDefinition[] {
  return [
    { label: 'Block' },
    ...styleableComponentParts(type).map((part) => ({
      label: part.label,
      partName: part.name,
    })),
  ];
}

export function componentHasStyleTargets(type: PageComponentType): boolean {
  return styleableComponentParts(type).length > 0;
}

export function isSelectedStyleTarget(
  target: BuilderStyleTarget | null | undefined,
  nodeId: string,
  partName: string | undefined,
): boolean {
  return target?.nodeId === nodeId && target.partName === partName;
}
