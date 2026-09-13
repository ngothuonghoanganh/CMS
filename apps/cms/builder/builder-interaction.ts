import type { Component } from 'grapesjs';

import {
  BUILDER_FORM_PREVIEW_ATTRIBUTE,
  BUILDER_RUNTIME_PREVIEW_ATTRIBUTE,
  BUILDER_QUOTE_PREVIEW_ATTRIBUTE,
  BUILDER_REUSABLE_PREVIEW_ATTRIBUTE,
  BUILDER_SEMANTIC_PREVIEW_ATTRIBUTE,
  BUILDER_NODE_SLOT_ATTRIBUTE,
  BUILDER_OPEN_COMPOSITION_ATTRIBUTE,
  type BuilderNodeType,
} from './builder-block/builder-adapter';
import {
  canInsertNode,
  canMoveNode,
  canReparentNode,
  findPayloadComponent,
  moveNodeByIntent as moveNodeAtPlacement,
  payloadNodeId,
  payloadNodeType,
  resolveInsertionPosition,
  resolveNodePlacement,
  type MoveNodeIntent,
} from './builder-placement';
import {
  canInsertLiveChild,
  openPayloadNodeType,
} from './builder-block/builder-structural-domain';
import {
  canMutateStructuralNode,
  isOpenCompositionNodeType,
  resolveSlotsForChild,
} from '@payload/contracts';

export { isBuilderNodeType } from './builder-block/builder-adapter';
export {
  canInsertNode,
  canMoveNode,
  canReparentNode,
  findPayloadComponent,
  payloadNodeId,
  payloadNodeType,
  resolveInsertionPosition,
  resolveNodePlacement,
};
export type { DropPosition, MoveNodeIntent } from './builder-placement';

export type MoveNodeResult =
  | { valid: true; source: Component; target: Component }
  | { valid: false; reason: string };

export type SelectedMoveDirection = 'up' | 'down' | 'outdent' | 'indent';

/**
 * Keyboard commands belong to the editor, not to controls that own text input.
 * This deliberately works across the GrapesJS iframe boundary: `instanceof`
 * checks against the parent window's Element constructor are not reliable for
 * nodes created by the iframe document.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as
    (HTMLElement & { closest?: (selector: string) => Element | null }) | null;
  if (!element) return false;
  if (element.isContentEditable) return true;
  const closest = element.closest?.(
    'input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"]',
  );
  return Boolean(closest && closest.getAttribute('contenteditable') !== 'false');
}

export function isEditorOnlyPreview(component: Component): boolean {
  // Compound components (for example a Tab panel) use an editor-only wrapper
  // around real persisted children. The child remains a Payload node and must
  // participate in Layers, selection, and drag/drop even though one of its
  // ancestors is only a preview projection.
  if (openPayloadNodeType(component)) return false;
  let current: Component | undefined = component;
  while (current) {
    const attributes = current.getAttributes({ noStyle: true });
    if (
      attributes[BUILDER_FORM_PREVIEW_ATTRIBUTE] !== undefined ||
      attributes[BUILDER_RUNTIME_PREVIEW_ATTRIBUTE] !== undefined ||
      attributes[BUILDER_QUOTE_PREVIEW_ATTRIBUTE] !== undefined ||
      attributes[BUILDER_REUSABLE_PREVIEW_ATTRIBUTE] !== undefined ||
      attributes[BUILDER_SEMANTIC_PREVIEW_ATTRIBUTE] !== undefined
    ) {
      return true;
    }
    current = current.parent();
  }
  return false;
}

export function payloadAncestor(component: Component | undefined): Component | undefined {
  let current = component;
  while (current) {
    if (openPayloadNodeType(current)) return current;
    current = current.parent();
  }
  return undefined;
}

export function validateNodeIntent(
  root: Component,
  intent: MoveNodeIntent,
): MoveNodeResult {
  const resolved = resolveNodePlacement(root, intent);
  return resolved.valid
    ? {
        valid: true,
        source: resolved.resolution.source,
        target: resolved.resolution.target,
      }
    : resolved;
}

/** Execute the validated structural command used by Canvas and Layers. */
export function moveNodeByIntent(
  root: Component,
  intent: MoveNodeIntent,
): MoveNodeResult {
  const resolved = moveNodeAtPlacement(root, intent);
  return resolved.valid
    ? {
        valid: true,
        source: resolved.resolution.source,
        target: resolved.resolution.target,
      }
    : resolved;
}

export function selectedMoveIntent(
  root: Component,
  selected: Component,
  direction: SelectedMoveDirection,
): MoveNodeIntent | undefined {
  const sourceId = payloadNodeId(selected);
  const sourceType = openPayloadNodeType(selected);
  if (!sourceId || !sourceType || sourceType === 'root') return undefined;

  const parent = selected.parent();
  if (!parent) return undefined;
  const selectedAttributes = selected.getAttributes({ noStyle: true });
  const selectedOpenType =
    selectedAttributes[BUILDER_OPEN_COMPOSITION_ATTRIBUTE] === 'true' &&
    isOpenCompositionNodeType(sourceType)
      ? sourceType
      : undefined;
  const parentAttributes = parent.getAttributes({ noStyle: true });
  const parentOpenType =
    parentAttributes[BUILDER_OPEN_COMPOSITION_ATTRIBUTE] === 'true' &&
    isOpenCompositionNodeType(openPayloadNodeType(parent))
      ? openPayloadNodeType(parent)
      : undefined;
  if (selectedOpenType && !canMutateStructuralNode(selectedOpenType, parentOpenType)) {
    return undefined;
  }
  const parentType = openPayloadNodeType(parent);
  const sourceIsOpen =
    selected.getAttributes({ noStyle: true })[BUILDER_OPEN_COMPOSITION_ATTRIBUTE] ===
    'true';
  const parentIsOpen =
    parent.getAttributes({ noStyle: true })[BUILDER_OPEN_COMPOSITION_ATTRIBUTE] ===
    'true';
  const structuralSlot =
    parentType &&
    !parentIsOpen &&
    !sourceIsOpen &&
    resolveSlotsForChild(
      parentType as BuilderNodeType,
      sourceType as BuilderNodeType,
    ).find((slot) => slot.structural);
  const siblings = parent
    .components()
    .models.filter((item) => Boolean(openPayloadNodeType(item)));
  const slotSiblings = structuralSlot
    ? siblings.filter((item) => {
        const ownedSlot = item.getAttributes({ noStyle: true })[
          BUILDER_NODE_SLOT_ATTRIBUTE
        ];
        return typeof ownedSlot === 'string'
          ? ownedSlot === structuralSlot.name
          : structuralSlot.accepts.includes(payloadNodeType(item) as never);
      })
    : siblings;
  const sourceIndex = slotSiblings.indexOf(selected);

  if (direction === 'up' || direction === 'down') {
    const target = slotSiblings[sourceIndex + (direction === 'up' ? -1 : 1)];
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

  const previous = slotSiblings[sourceIndex - 1];
  const previousId = previous && payloadNodeId(previous);
  const previousType = previous && openPayloadNodeType(previous);
  const canIndent =
    sourceIsOpen && parentIsOpen
      ? Boolean(previous && canInsertLiveChild(previous, sourceType))
      : Boolean(
          previousType &&
          canInsertNode(
            previousType as Parameters<typeof canInsertNode>[0],
            sourceType as Parameters<typeof canInsertNode>[1],
          ),
        );
  if (!previousId || !canIndent) {
    return undefined;
  }
  return { nodeId: sourceId, targetNodeId: previousId, position: 'inside' };
}
