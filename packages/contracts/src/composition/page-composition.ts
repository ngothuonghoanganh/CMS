import { z } from 'zod';

import {
  canContainPageComponentV1,
  PageNodeV1Schema,
  PageNodeIdV1Schema,
  type PageNodeV1,
} from '../page/page-node';

export const PAGE_COMPOSITION_V1_SCHEMA_VERSION = 1 as const;
export const PAGE_COMPOSITION_V1_MAX_NODES = 200;
export const PAGE_COMPOSITION_V1_MAX_TREE_DEPTH = 24;
export const PAGE_COMPOSITION_V1_MAX_SERIALIZED_BYTES = 256 * 1024;

/**
 * Settings are intentionally empty in Slice 1. Route, SEO, site globals and
 * publishing state have separate owners; adding an unowned setting here would
 * recreate the metadata duplication that this contract is meant to remove.
 */
export const PageSettingsV1Schema = z.object({}).strict();
export type PageSettingsV1 = z.infer<typeof PageSettingsV1Schema>;

/**
 * A behavior reference is a stable domain/runtime relation, not editor state.
 * The first slice reserves this narrow shape for future form/action contracts;
 * legacy behavior payloads are not copied into it by the compatibility adapter.
 */
export const PageBehaviorReferenceV1Schema = z
  .object({
    id: PageNodeIdV1Schema,
    nodeId: PageNodeIdV1Schema,
    kind: z.enum(['field', 'action', 'state-binding']),
    targetNodeId: PageNodeIdV1Schema.optional(),
    referenceId: PageNodeIdV1Schema.optional(),
  })
  .strict();
export type PageBehaviorReferenceV1 = z.infer<typeof PageBehaviorReferenceV1Schema>;

export const PageCompositionV1Schema = z
  .object({
    version: z.literal(PAGE_COMPOSITION_V1_SCHEMA_VERSION),
    root: PageNodeV1Schema,
    settings: PageSettingsV1Schema,
    behaviorRefs: z.array(PageBehaviorReferenceV1Schema).max(200).optional(),
  })
  .strict()
  .superRefine((composition, context) => {
    if (composition.root.type !== 'root' || composition.root.id !== 'root') {
      context.addIssue({
        code: 'custom',
        path: ['root'],
        message: 'PageCompositionV1 root must have type root and id root',
      });
    }

    const nodeIds = new Set<string>();
    const behaviorIds = new Set<string>();
    const pending: Array<{
      node: PageNodeV1;
      path: (string | number)[];
      depth: number;
      parentType?: PageNodeV1['type'];
    }> = [{ node: composition.root, path: ['root'], depth: 1 }];
    let nodeCount = 0;

    while (pending.length > 0) {
      const current = pending.pop();
      if (!current) continue;
      nodeCount += 1;

      if (nodeCount > PAGE_COMPOSITION_V1_MAX_NODES) {
        context.addIssue({
          code: 'custom',
          path: current.path,
          message: `PAGE_COMPOSITION_V1_NODE_LIMIT_EXCEEDED: maximum is ${PAGE_COMPOSITION_V1_MAX_NODES}`,
        });
        break;
      }
      if (current.depth > PAGE_COMPOSITION_V1_MAX_TREE_DEPTH) {
        context.addIssue({
          code: 'custom',
          path: current.path,
          message: `PAGE_COMPOSITION_V1_DEPTH_LIMIT_EXCEEDED: maximum is ${PAGE_COMPOSITION_V1_MAX_TREE_DEPTH}`,
        });
        continue;
      }
      if (nodeIds.has(current.node.id)) {
        context.addIssue({
          code: 'custom',
          path: [...current.path, 'id'],
          message: `Duplicate page node id: ${current.node.id}`,
        });
      }
      nodeIds.add(current.node.id);

      if (
        current.parentType &&
        !canContainPageComponentV1(current.parentType, current.node.type)
      ) {
        context.addIssue({
          code: 'custom',
          path: [...current.path, 'type'],
          message: `Node type ${current.node.type} cannot be placed inside ${current.parentType}`,
        });
      }

      current.node.children.forEach((child, index) => {
        if (!canContainPageComponentV1(current.node.type, child.type)) {
          context.addIssue({
            code: 'custom',
            path: [...current.path, 'children', index, 'type'],
            message: `Node type ${current.node.type} cannot contain ${child.type} children`,
          });
        }
        pending.push({
          node: child,
          path: [...current.path, 'children', index],
          depth: current.depth + 1,
          parentType: current.node.type,
        });
      });
    }

    for (const [index, behavior] of (composition.behaviorRefs ?? []).entries()) {
      if (behaviorIds.has(behavior.id)) {
        context.addIssue({
          code: 'custom',
          path: ['behaviorRefs', index, 'id'],
          message: `Duplicate page behavior id: ${behavior.id}`,
        });
      }
      behaviorIds.add(behavior.id);
      if (!nodeIds.has(behavior.nodeId)) {
        context.addIssue({
          code: 'custom',
          path: ['behaviorRefs', index, 'nodeId'],
          message: `Behavior references missing node: ${behavior.nodeId}`,
        });
      }
      if (behavior.targetNodeId && !nodeIds.has(behavior.targetNodeId)) {
        context.addIssue({
          code: 'custom',
          path: ['behaviorRefs', index, 'targetNodeId'],
          message: `Behavior references missing target node: ${behavior.targetNodeId}`,
        });
      }
    }

    const serializedSize = new TextEncoder().encode(JSON.stringify(composition)).length;
    if (serializedSize > PAGE_COMPOSITION_V1_MAX_SERIALIZED_BYTES) {
      context.addIssue({
        code: 'custom',
        path: [],
        message: `PAGE_COMPOSITION_V1_TOO_LARGE: maximum serialized size is ${PAGE_COMPOSITION_V1_MAX_SERIALIZED_BYTES} bytes`,
      });
    }
  });

export type PageCompositionV1 = z.infer<typeof PageCompositionV1Schema>;

/** The sole validation entry point for canonical authoring data. */
export function parsePageCompositionV1(input: unknown): PageCompositionV1 {
  return PageCompositionV1Schema.parse(input);
}

export function createEmptyPageCompositionV1(): PageCompositionV1 {
  return parsePageCompositionV1({
    version: 1,
    root: { id: 'root', type: 'root', props: {}, children: [] },
    settings: {},
  });
}

export function serializePageCompositionV1(input: unknown): string {
  return JSON.stringify(parsePageCompositionV1(input));
}

export function deserializePageCompositionV1(serialized: string): PageCompositionV1 {
  return parsePageCompositionV1(JSON.parse(serialized) as unknown);
}
