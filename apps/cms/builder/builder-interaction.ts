import type { Component } from 'grapesjs';

import {
  BUILDER_FORM_PREVIEW_ATTRIBUTE,
  BUILDER_NODE_ID_ATTRIBUTE,
  BUILDER_NODE_TYPE_ATTRIBUTE,
  canContainNode,
  isBuilderNodeType,
  type BuilderNodeType,
} from './builder-adapter';

export { isBuilderNodeType } from './builder-adapter';

export type DropPosition = 'before' | 'inside' | 'after';

export type MoveNodeIntent = {
  nodeId: string;
  targetNodeId: string;
  position: DropPosition;
};

export type MoveNodeResult =
  | { valid: true; source: Component; target: Component }
  | { valid: false; reason: string };

export type SelectedMoveDirection = 'up' | 'down' | 'outdent' | 'indent';

export function payloadNodeType(component: Component): BuilderNodeType | undefined {
  const type = component.getAttributes({ noStyle: true })[BUILDER_NODE_TYPE_ATTRIBUTE];
  return isBuilderNodeType(type) ? type : undefined;
}

export function payloadNodeId(component: Component): string | undefined {
  const id = component.getAttributes({ noStyle: true })[BUILDER_NODE_ID_ATTRIBUTE];
  return typeof id === 'string' ? id : undefined;
}

export function isEditorOnlyPreview(component: Component): boolean {
  return (
    component.getAttributes({ noStyle: true })[BUILDER_FORM_PREVIEW_ATTRIBUTE] !==
    undefined
  );
}

export function payloadAncestor(component: Component | undefined): Component | undefined {
  let current = component;
  while (current) {
    if (payloadNodeType(current)) return current;
    current = current.parent();
  }
  return undefined;
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

function invalid(reason: string): MoveNodeResult {
  return { valid: false, reason };
}

function resolveNodeMove(
  root: Component,
  intent: MoveNodeIntent,
):
  | { source: Component; target: Component; destination: Component; at?: number }
  | MoveNodeResult {
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
  let at: number | undefined;
  if (intent.position === 'inside') {
    if (!canContainNode(targetType, sourceType)) {
      return invalid(`${targetType} cannot contain ${sourceType}.`);
    }
    destination = target;
  } else {
    destination = target.parent();
    const destinationType = destination ? payloadNodeType(destination) : undefined;
    if (
      !destination ||
      !destinationType ||
      !canContainNode(destinationType, sourceType)
    ) {
      return invalid('The target position does not accept this node.');
    }
    at = target.index() + (intent.position === 'after' ? 1 : 0);
  }

  if (destination === source || isAncestor(source, destination)) {
    return invalid('A node cannot be moved into its own descendant.');
  }
  return {
    source,
    target,
    destination,
    ...(at === undefined ? {} : { at }),
  };
}

export function validateNodeIntent(
  root: Component,
  intent: MoveNodeIntent,
): MoveNodeResult {
  const resolved = resolveNodeMove(root, intent);
  return 'valid' in resolved
    ? resolved
    : { valid: true, source: resolved.source, target: resolved.target };
}

/**
 * Validate and execute one structural move. Both Canvas and Layers call this
 * operation so the GrapesJS model remains the only source of truth.
 */
export function moveNodeByIntent(
  root: Component,
  intent: MoveNodeIntent,
): MoveNodeResult {
  const resolved = resolveNodeMove(root, intent);
  if ('valid' in resolved) return resolved;
  resolved.source.move(
    resolved.destination,
    resolved.at === undefined ? undefined : { at: resolved.at },
  );
  return { valid: true, source: resolved.source, target: resolved.target };
}

export function selectedMoveIntent(
  root: Component,
  selected: Component,
  direction: SelectedMoveDirection,
): MoveNodeIntent | undefined {
  const sourceId = payloadNodeId(selected);
  const sourceType = payloadNodeType(selected);
  if (!sourceId || !sourceType || sourceType === 'root') return undefined;

  const parent = selected.parent();
  if (!parent) return undefined;
  const siblings = parent
    .components()
    .models.filter((item) => Boolean(payloadNodeType(item)));
  const sourceIndex = siblings.indexOf(selected);

  if (direction === 'up' || direction === 'down') {
    const target = siblings[sourceIndex + (direction === 'up' ? -1 : 1)];
    const targetId = target && payloadNodeId(target);
    if (!targetId) return undefined;
    return {
      nodeId: sourceId,
      targetNodeId: targetId,
      position: direction === 'up' ? 'before' : 'after',
    };
  }

  if (direction === 'outdent') {
    const grandparent = parent.parent();
    const parentId = payloadNodeId(parent);
    if (!grandparent || !parentId) return undefined;
    return { nodeId: sourceId, targetNodeId: parentId, position: 'after' };
  }

  const previous = siblings[sourceIndex - 1];
  const previousId = previous && payloadNodeId(previous);
  if (!previousId || !canContainNode(payloadNodeType(previous) ?? 'text', sourceType)) {
    return undefined;
  }
  return { nodeId: sourceId, targetNodeId: previousId, position: 'inside' };
}
