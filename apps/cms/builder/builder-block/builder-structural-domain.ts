import type { Component } from 'grapesjs';
import {
  canInsertIntoSlot,
  canComposeChild,
  OPEN_COMPOSITION_REGISTRY,
  isOpenCompositionNodeType,
  resolveSlotForChild,
  resolveSlotsForChild,
  type ComponentSlotDefinition,
  type ComponentSlotOccupancy,
  type OpenCompositionNodeType,
} from '@payload/contracts';

import {
  BUILDER_NODE_SLOT_ATTRIBUTE,
  BUILDER_NODE_TYPE_ATTRIBUTE,
  isBuilderNodeType,
  type BuilderNodeType,
} from './builder-adapter';

/** Shared live slot ownership and cardinality rules for all builder surfaces. */
export function liveSlotOccupancy(
  parent: Component,
  slot: ComponentSlotDefinition,
  excluded?: Component,
): ComponentSlotOccupancy {
  const count = parent.components().models.filter((child) => {
    if (child === excluded) return false;
    const attributes = child.getAttributes({ noStyle: true });
    const ownedSlot = attributes[BUILDER_NODE_SLOT_ATTRIBUTE];
    return typeof ownedSlot === 'string'
      ? ownedSlot === slot.name
      : slot.accepts.includes(payloadNodeType(child) as never);
  }).length;
  return { count, bySlot: { [slot.name]: count } };
}

export function payloadNodeType(component: Component): BuilderNodeType | undefined {
  const type = component.getAttributes({ noStyle: true })[BUILDER_NODE_TYPE_ATTRIBUTE];
  return isBuilderNodeType(type) ? type : undefined;
}

/** Returns the V8 node type when the component belongs to an Open Composition tree. */
export function openPayloadNodeType(
  component: Component,
): BuilderNodeType | OpenCompositionNodeType | undefined {
  const attributes = component.getAttributes({ noStyle: true });
  const type = attributes[BUILDER_NODE_TYPE_ATTRIBUTE];
  if (
    attributes['data-payload-open-composition'] === 'true' &&
    isOpenCompositionNodeType(type)
  ) {
    return type;
  }
  return isBuilderNodeType(type) ? type : undefined;
}

export function liveSlotsForChild(
  parent: Component | undefined,
  childType: BuilderNodeType,
): readonly ComponentSlotDefinition[] {
  const parentType = parent && payloadNodeType(parent);
  return parentType ? resolveSlotsForChild(parentType, childType) : [];
}

export function liveSlotForChild(
  parent: Component | undefined,
  childType: BuilderNodeType,
): ComponentSlotDefinition | undefined {
  return liveSlotsForChild(parent, childType)[0];
}

export { resolveSlotForChild };

export function canInsertLiveChild(
  parent: Component,
  childType: BuilderNodeType | OpenCompositionNodeType,
  excluded?: Component,
  slotName?: string,
): boolean {
  const parentAttributes = parent.getAttributes({ noStyle: true });
  if (parentAttributes['data-payload-open-composition'] === 'true') {
    const parentType = parentAttributes[BUILDER_NODE_TYPE_ATTRIBUTE];
    return isOpenCompositionNodeType(parentType) && isOpenCompositionNodeType(childType)
      ? canComposeChild(parentType, childType) &&
          OPEN_COMPOSITION_REGISTRY[childType].authoring.directInsert
      : false;
  }
  const parentType = payloadNodeType(parent);
  if (!parentType || !isBuilderNodeType(childType)) return false;
  const slot = slotName
    ? resolveSlotsForChild(parentType, childType).find(
        (candidate) => candidate.name === slotName,
      )
    : resolveSlotForChild(parentType, childType);
  return Boolean(
    slot &&
    canInsertIntoSlot({
      parentType,
      slotName: slot.name,
      childType,
      occupancy: liveSlotOccupancy(parent, slot, excluded),
    }),
  );
}
