import type { Component } from 'grapesjs';

import {
  BUILDER_NODE_ID_ATTRIBUTE,
  BUILDER_NODE_TYPE_ATTRIBUTE,
  canContainNode,
  isBuilderNodeType,
  type BuilderNodeType,
} from './builder-adapter';

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
): boolean {
  return canContainNode(parentType, childType);
}

export function payloadNodeType(component: Component): BuilderNodeType | undefined {
  const type = component.getAttributes({ noStyle: true })[BUILDER_NODE_TYPE_ATTRIBUTE];
  return isBuilderNodeType(type) ? type : undefined;
}

export function payloadNodeId(component: Component): string | undefined {
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
  if (intent.position === 'inside') {
    if (!canInsertNode(targetType, sourceType)) {
      return invalid(`${targetType} cannot contain ${sourceType}.`);
    }
    destination = target;
  } else {
    destination = target.parent();
    const destinationType = destination ? payloadNodeType(destination) : undefined;
    if (!destination || !destinationType || !canInsertNode(destinationType, sourceType)) {
      return invalid('The target position does not accept this node.');
    }
    index = target.index() + (intent.position === 'after' ? 1 : 0);
    // GrapesJS interprets `at` as the destination collection position and
    // handles removal from a same-parent collection internally.
  }

  if (destination === source || isAncestor(source, destination)) {
    return invalid('A node cannot be moved into its own descendant.');
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
  source.move(destination, index === undefined ? undefined : { at: index });
  return result;
}
