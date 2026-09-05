import { PAGE_COMPONENT_REGISTRY, type PageComponentType } from './component-registry';
import {
  PageDocumentSchema,
  PagePayloadSchema,
  type AnyPageNode,
  type PageDocument,
  type PagePayload,
} from './index';

export type PageChangeCategory =
  | 'node-added'
  | 'node-removed'
  | 'node-moved'
  | 'node-reordered'
  | 'node-type-changed'
  | 'content-property-changed'
  | 'design-property-changed'
  | 'style-changed'
  | 'responsive-style-changed'
  | 'query-changed'
  | 'binding-changed'
  | 'action-changed'
  | 'resource-changed'
  | 'layout-attachment-changed'
  | 'component-attachment-changed';

export type PageChange = {
  category: PageChangeCategory;
  nodeId?: string;
  nodeType?: string;
  property?: string;
};

export type PageChangeClassification = {
  contentChanges: PageChange[];
  designChanges: PageChange[];
};

export type PageChangeSummary = {
  contentFieldChanges: number;
  designValueChanges: number;
  componentsAdded: number;
  componentsRemoved: number;
  componentsMoved: number;
  componentsReordered: number;
  componentsTypeChanged: number;
};

type NodeRecord = {
  node: AnyPageNode;
  parentId?: string;
  index: number;
};

type ComparableDocument = {
  payload: PagePayload;
  composition: NonNullable<PageDocument['composition']>;
};

function normalizeDocument(input: PageDocument | PagePayload): ComparableDocument {
  const parsedDocument = PageDocumentSchema.safeParse(input);
  if (parsedDocument.success) {
    return {
      payload: parsedDocument.data.payload,
      composition: {
        attachments: parsedDocument.data.composition?.attachments ?? [],
        layoutAttachments: parsedDocument.data.composition?.layoutAttachments ?? [],
        bindings: parsedDocument.data.composition?.bindings ?? [],
        actions: parsedDocument.data.composition?.actions ?? [],
        resources: parsedDocument.data.composition?.resources ?? [],
        queries: parsedDocument.data.composition?.queries ?? [],
      },
    };
  }

  return {
    payload: PagePayloadSchema.parse(input),
    composition: {
      attachments: [],
      layoutAttachments: [],
      bindings: [],
      actions: [],
      resources: [],
      queries: [],
    },
  };
}

function collectNodes(root: AnyPageNode): Map<string, NodeRecord> {
  const result = new Map<string, NodeRecord>();
  function visit(node: AnyPageNode, parentId: string | undefined, index: number) {
    result.set(node.id, { node, ...(parentId ? { parentId } : {}), index });
    node.children.forEach((child, childIndex) => visit(child, node.id, childIndex));
  }
  visit(root, undefined, 0);
  return result;
}

function propertyScope(type: string, property: string): 'content' | 'design' {
  const definition = PAGE_COMPONENT_REGISTRY[type as PageComponentType];
  const descriptor = definition?.propertiesSchema.find(
    (candidate) => candidate.key === property,
  );
  // Unknown properties are deliberately design-scoped. This keeps a future or
  // malformed property from becoming an authorization bypass for content-only users.
  return descriptor?.editingScope === 'content' ? 'content' : 'design';
}

function valueAt(record: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((item, index) => valuesEqual(item, right[index]));
  }
  if (typeof left !== 'object' || typeof right !== 'object') return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]);
  return [...keys].every((key) => valuesEqual(leftRecord[key], rightRecord[key]));
}

function addCompositionChange(
  classification: PageChangeClassification,
  category: PageChangeCategory,
): void {
  classification.designChanges.push({ category });
}

/**
 * Compare two editor snapshots using node identity and registry metadata.
 * The classifier is intentionally conservative: structural or unknown changes
 * are design changes, while only explicitly content-scoped properties are safe
 * for a content-only editor.
 */
export function classifyPageDocumentChanges(
  previousInput: PageDocument | PagePayload,
  nextInput: PageDocument | PagePayload,
): PageChangeClassification {
  const previous = normalizeDocument(previousInput);
  const next = normalizeDocument(nextInput);
  const classification: PageChangeClassification = {
    contentChanges: [],
    designChanges: [],
  };
  const previousNodes = collectNodes(previous.payload.root as AnyPageNode);
  const nextNodes = collectNodes(next.payload.root as AnyPageNode);

  for (const [nodeId, previousRecord] of previousNodes) {
    const nextRecord = nextNodes.get(nodeId);
    if (!nextRecord) {
      classification.designChanges.push({
        category: 'node-removed',
        nodeId,
        nodeType: previousRecord.node.type,
      });
      continue;
    }
    if (previousRecord.node.type !== nextRecord.node.type) {
      classification.designChanges.push({
        category: 'node-type-changed',
        nodeId,
        nodeType: `${previousRecord.node.type}->${nextRecord.node.type}`,
      });
      continue;
    }
    if (previousRecord.parentId !== nextRecord.parentId) {
      classification.designChanges.push({
        category: 'node-moved',
        nodeId,
        nodeType: nextRecord.node.type,
      });
    } else if (previousRecord.index !== nextRecord.index) {
      classification.designChanges.push({
        category: 'node-reordered',
        nodeId,
        nodeType: nextRecord.node.type,
      });
    }

    const previousProps = previousRecord.node.props as Record<string, unknown>;
    const nextProps = nextRecord.node.props as Record<string, unknown>;
    const propertyKeys = new Set([
      ...Object.keys(previousProps),
      ...Object.keys(nextProps),
    ]);
    for (const property of propertyKeys) {
      if (valuesEqual(valueAt(previousProps, property), valueAt(nextProps, property))) {
        continue;
      }
      const change = {
        nodeId,
        nodeType: nextRecord.node.type,
        property,
      };
      if (propertyScope(nextRecord.node.type, property) === 'content') {
        classification.contentChanges.push({
          category: 'content-property-changed',
          ...change,
        });
      } else {
        classification.designChanges.push({
          category: 'design-property-changed',
          ...change,
        });
      }
    }

    if (!valuesEqual(previousRecord.node.style, nextRecord.node.style)) {
      classification.designChanges.push({
        category: 'style-changed',
        nodeId,
        nodeType: nextRecord.node.type,
      });
      if (
        !valuesEqual(
          (previousRecord.node.style as Record<string, unknown> | undefined)?.tablet,
          (nextRecord.node.style as Record<string, unknown> | undefined)?.tablet,
        ) ||
        !valuesEqual(
          (previousRecord.node.style as Record<string, unknown> | undefined)?.mobile,
          (nextRecord.node.style as Record<string, unknown> | undefined)?.mobile,
        )
      ) {
        classification.designChanges.push({
          category: 'responsive-style-changed',
          nodeId,
          nodeType: nextRecord.node.type,
        });
      }
    }
    const previousPartsStyle =
      'partsStyle' in previousRecord.node ? previousRecord.node.partsStyle : undefined;
    const nextPartsStyle =
      'partsStyle' in nextRecord.node ? nextRecord.node.partsStyle : undefined;
    if (!valuesEqual(previousPartsStyle, nextPartsStyle)) {
      classification.designChanges.push({
        category: 'style-changed',
        nodeId,
        nodeType: nextRecord.node.type,
        property: 'partsStyle',
      });
    }
  }

  for (const [nodeId, nextRecord] of nextNodes) {
    if (!previousNodes.has(nodeId)) {
      classification.designChanges.push({
        category: 'node-added',
        nodeId,
        nodeType: nextRecord.node.type,
      });
    }
  }

  const compositionPairs: Array<
    [keyof ComparableDocument['composition'], PageChangeCategory]
  > = [
    ['queries', 'query-changed'],
    ['bindings', 'binding-changed'],
    ['actions', 'action-changed'],
    ['resources', 'resource-changed'],
    ['layoutAttachments', 'layout-attachment-changed'],
    ['attachments', 'component-attachment-changed'],
  ];
  for (const [key, category] of compositionPairs) {
    if (!valuesEqual(previous.composition[key], next.composition[key])) {
      addCompositionChange(classification, category);
    }
  }

  return classification;
}

export function summarizePageChanges(
  classification: PageChangeClassification,
): PageChangeSummary {
  const summary: PageChangeSummary = {
    contentFieldChanges: classification.contentChanges.filter(
      (change) => change.category === 'content-property-changed',
    ).length,
    designValueChanges: classification.designChanges.filter(
      (change) =>
        change.category === 'design-property-changed' ||
        change.category === 'style-changed',
    ).length,
    componentsAdded: classification.designChanges.filter(
      (change) => change.category === 'node-added',
    ).length,
    componentsRemoved: classification.designChanges.filter(
      (change) => change.category === 'node-removed',
    ).length,
    componentsMoved: classification.designChanges.filter(
      (change) => change.category === 'node-moved',
    ).length,
    componentsReordered: classification.designChanges.filter(
      (change) => change.category === 'node-reordered',
    ).length,
    componentsTypeChanged: classification.designChanges.filter(
      (change) => change.category === 'node-type-changed',
    ).length,
  };
  return summary;
}
