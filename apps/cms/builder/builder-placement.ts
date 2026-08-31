import type { Component } from 'grapesjs';

import {
  BUILDER_FORM_PREVIEW_ATTRIBUTE,
  BUILDER_NODE_ID_ATTRIBUTE,
  BUILDER_NODE_SLOT_ATTRIBUTE,
  BUILDER_QUOTE_PREVIEW_ATTRIBUTE,
  BUILDER_REUSABLE_PREVIEW_ATTRIBUTE,
  BUILDER_RUNTIME_PREVIEW_ATTRIBUTE,
  type BuilderNodeType,
} from './builder-adapter';
import {
  canInsertChild,
  canRemoveFromSlot,
  type ComponentSlotOccupancy,
} from '@payload/contracts';
import {
  canInsertLiveChild,
  liveSlotForChild,
  liveSlotOccupancy,
  payloadNodeType,
  resolveSlotForChild,
} from './builder-structural-domain';

/** The three insertion semantics shared by Canvas, Layers and Quick Add. */
export type DropPosition = 'before' | 'inside' | 'after';

export type MoveNodeIntent = {
  nodeId: string;
  targetNodeId: string;
  position: DropPosition;
};

export type PlacementResolution = {
  source: Component;
  target: Component;
  destination: Component;
  /** GrapesJS destination collection index for before/after placement. */
  index?: number;
};

export type PlacementValidation =
  { valid: true; resolution: PlacementResolution } | { valid: false; reason: string };

/** Registry-derived parent/child predicate used by every insertion surface. */
export function canInsertNode(
  parentType: BuilderNodeType,
  childType: BuilderNodeType,
  occupancy: ComponentSlotOccupancy | number = 0,
): boolean {
  return canInsertChild(parentType, childType, occupancy);
}

export { liveSlotForChild, liveSlotOccupancy };

export { payloadNodeType } from './builder-structural-domain';

function isEditorOnlyComponent(component: Component): boolean {
  let current: Component | undefined = component;
  while (current) {
    const attributes = current.getAttributes({ noStyle: true });
    if (
      attributes[BUILDER_FORM_PREVIEW_ATTRIBUTE] !== undefined ||
      attributes[BUILDER_RUNTIME_PREVIEW_ATTRIBUTE] !== undefined ||
      attributes[BUILDER_QUOTE_PREVIEW_ATTRIBUTE] !== undefined ||
      attributes[BUILDER_REUSABLE_PREVIEW_ATTRIBUTE] !== undefined
    ) {
      return true;
    }
    current = current.parent();
  }
  return false;
}

export function payloadNodeId(component: Component): string | undefined {
  if (isEditorOnlyComponent(component)) return undefined;
  const id = component.getAttributes({ noStyle: true })[BUILDER_NODE_ID_ATTRIBUTE];
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

export function findPayloadComponent(root: Component, id: string): Component | undefined {
  let match: Component | undefined;
  root.onAll((component) => {
    if (!match && payloadNodeId(component) === id) match = component;
  });
  return match;
}

function isAncestor(ancestor: Component, component: Component): boolean {
  let current = component.parent();
  while (current) {
    if (current === ancestor) return true;
    current = current.parent();
  }
  return false;
}

function invalid(reason: string): PlacementValidation {
  return { valid: false, reason };
}

/** Resolve and validate an intent without mutating the live editor model. */
export function resolveNodePlacement(
  root: Component,
  intent: MoveNodeIntent,
): PlacementValidation {
  const source = findPayloadComponent(root, intent.nodeId);
  const target = findPayloadComponent(root, intent.targetNodeId);
  if (!source || !target) return invalid('The source or target node no longer exists.');

  const sourceType = payloadNodeType(source);
  const targetType = payloadNodeType(target);
  if (!sourceType || !targetType || sourceType === 'root') {
    return invalid('The page root cannot be moved.');
  }
  if (source === target) return invalid('A node cannot be dropped on itself.');
  if (isAncestor(source, target)) {
    return invalid('A node cannot be moved into its own descendant.');
  }

  let destination: Component | undefined;
  let index: number | undefined;
  const sourceParent = source.parent();
  const sourceSlot = liveSlotForChild(sourceParent, sourceType);
  if (intent.position === 'inside') {
    const sameParent = sourceParent === target;
    if (!canInsertLiveChild(target, sourceType, sameParent ? source : undefined)) {
      return invalid(`${targetType} cannot contain ${sourceType}.`);
    }
    destination = target;
  } else {
    destination = target.parent();
    const destinationType = destination ? payloadNodeType(destination) : undefined;
    const sameParent = sourceParent === destination;
    if (
      !destination ||
      !destinationType ||
      !canInsertLiveChild(destination, sourceType, sameParent ? source : undefined)
    ) {
      return invalid('The target position does not accept this node.');
    }
    index = target.index() + (intent.position === 'after' ? 1 : 0);
    // GrapesJS interprets `at` as the destination collection position and
    // handles removal from a same-parent collection internally.
  }

  if (destination === source || isAncestor(source, destination)) {
    return invalid('A node cannot be moved into its own descendant.');
  }
  if (sourceParent && sourceParent !== destination) {
    const sourceParentType = payloadNodeType(sourceParent);
    if (
      sourceParentType &&
      sourceSlot &&
      !canRemoveFromSlot({
        parentType: sourceParentType,
        slotName: sourceSlot.name,
        childType: sourceType,
        occupancy: liveSlotOccupancy(sourceParent, sourceSlot),
      })
    ) {
      return invalid(`${sourceParentType} must keep at least one structural child.`);
    }
  }
  return {
    valid: true,
    resolution: {
      source,
      target,
      destination,
      ...(index === undefined ? {} : { index }),
    },
  };
}

export function canMoveNode(root: Component, intent: MoveNodeIntent): boolean {
  return resolveNodePlacement(root, intent).valid;
}

export function canReparentNode(root: Component, intent: MoveNodeIntent): boolean {
  const result = resolveNodePlacement(root, intent);
  return (
    result.valid && result.resolution.source.parent() !== result.resolution.destination
  );
}

export function resolveInsertionPosition(
  root: Component,
  intent: MoveNodeIntent,
): { valid: true; parent: Component; index?: number } | { valid: false; reason: string } {
  const result = resolveNodePlacement(root, intent);
  return result.valid
    ? {
        valid: true,
        parent: result.resolution.destination,
        ...(result.resolution.index === undefined
          ? {}
          : { index: result.resolution.index }),
      }
    : result;
}

export function moveNodeByIntent(
  root: Component,
  intent: MoveNodeIntent,
): PlacementValidation {
  const result = resolveNodePlacement(root, intent);
  if (!result.valid) return result;
  const { source, destination, index } = result.resolution;
  const sourceType = payloadNodeType(source);
  const destinationType = payloadNodeType(destination);
  if (sourceType && destinationType) {
    const slot = resolveSlotForChild(destinationType, sourceType);
    if (slot && typeof source.setAttributes === 'function') {
      source.setAttributes({
        ...source.getAttributes({ noStyle: true }),
        [BUILDER_NODE_SLOT_ATTRIBUTE]: slot.name,
      });
    }
  }
  source.move(destination, index === undefined ? undefined : { at: index });
  return result;
}
