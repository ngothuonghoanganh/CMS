/**
 * The only place where builder node identity is created or remapped.
 *
 * GrapesJS component models are deliberately not used here. A definition is
 * made safe before it reaches the live editor, which means an invalid ID can
 * never exist in the document between clone/append lifecycle events.
 */

const NODE_ID_ATTRIBUTE = 'data-payload-node-id';
const NODE_TYPE_ATTRIBUTE = 'data-payload-node-type';
const REFERENCE_KEYS = new Set([
  'aria-controls',
  'aria-describedby',
  'aria-labelledby',
  'for',
  'nodeId',
  'parentId',
  'sourceId',
  'targetId',
  'targetNodeId',
]);

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function childValues(node: UnknownRecord): unknown[] {
  const children = node.children;
  const components = node.components;
  const root = node.root;
  const values: unknown[] = [];
  if (Array.isArray(children)) values.push(...children);
  if (Array.isArray(components)) values.push(...components);
  else if (isRecord(components)) values.push(components);
  if (isRecord(root)) values.push(root);
  return values;
}

function nodeIds(node: UnknownRecord): string[] {
  const attributes = isRecord(node.attributes) ? node.attributes : undefined;
  const ids = [node.id, attributes?.[NODE_ID_ATTRIBUTE]].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );
  return [...new Set(ids)];
}

function isPersistedNode(node: UnknownRecord): boolean {
  const attributes = isRecord(node.attributes) ? node.attributes : undefined;
  return (
    nodeIds(node).length > 0 ||
    typeof node.type === 'string' ||
    typeof attributes?.[NODE_TYPE_ATTRIBUTE] === 'string'
  );
}

function walkNodes(value: unknown, visit: (node: UnknownRecord) => void): void {
  if (!isRecord(value)) return;
  if (isPersistedNode(value)) visit(value);
  childValues(value).forEach((child) => walkNodes(child, visit));
}

/** Collects persisted IDs from either a PagePayload tree or an editor definition tree. */
export function collectPersistedNodeIds(value: unknown): Set<string> {
  const ids = new Set<string>();
  walkNodes(value, (node) => nodeIds(node).forEach((id) => ids.add(id)));
  return ids;
}

/** Returns each duplicate once, in first-seen order. */
export function findDuplicatePersistedNodeIds(value: unknown): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  walkNodes(value, (node) => {
    nodeIds(node).forEach((id) => {
      if (seen.has(id)) duplicates.add(id);
      else seen.add(id);
    });
  });
  return [...duplicates];
}

export function assertUniquePersistedNodeIds(value: unknown): void {
  const duplicates = findDuplicatePersistedNodeIds(value);
  if (duplicates.length > 0) {
    throw new Error(`Duplicate persisted node ids: ${duplicates.join(', ')}`);
  }
}

/**
 * Repairs only duplicate persisted IDs while preserving the first occurrence
 * of every ID. This is used when hydrating legacy/corrupted documents so a
 * duplicate cannot reach React keys, GrapesJS selection, or command targets.
 */
export function repairDuplicatePersistedNodeIds<T>(value: T): T {
  const usedIds = new Set<string>();

  const repair = (
    input: unknown,
    references = new Map<string, string>(),
    nodeCandidate = false,
  ): unknown => {
    if (Array.isArray(input)) return input.map((entry) => repair(entry, references));
    if (!isRecord(input)) {
      return typeof input === 'string' ? replaceReference(input, references) : input;
    }

    const ids = nodeIds(input);
    const isNode = nodeCandidate && isPersistedNode(input) && ids.length > 0;
    let next = { ...input };
    let scopedReferences = references;
    if (isNode) {
      const duplicate = ids.some((id) => usedIds.has(id));
      if (duplicate) {
        const nextId = generateFreshNodeId(nodeType(input), usedIds);
        scopedReferences = new Map(references);
        ids.forEach((id) => scopedReferences.set(id, nextId));
        if (typeof input.id === 'string' || !isRecord(input.attributes)) {
          next.id = nextId;
        }
        if (isRecord(input.attributes)) {
          next.attributes = {
            ...input.attributes,
            [NODE_ID_ATTRIBUTE]: nextId,
          };
        }
        usedIds.add(nextId);
      } else {
        ids.forEach((id) => usedIds.add(id));
      }
    }

    Object.entries(next).forEach(([key, child]) => {
      if (key === 'children' || key === 'components') {
        next[key] = Array.isArray(child)
          ? child.map((entry) => repair(entry, scopedReferences, true))
          : isRecord(child)
            ? repair(child, scopedReferences, true)
            : child;
        return;
      }
      const isDocumentRoot =
        key === 'root' &&
        ('version' in next || 'documentKind' in next || 'schemaVersion' in next);
      next[key] = repair(child, scopedReferences, isDocumentRoot);
    });
    return next;
  };

  return repair(value, new Map(), true) as T;
}

export function repairDuplicatePersistedNodeIdsWithReport<T>(value: T): {
  value: T;
  normalized: boolean;
  duplicateIds: string[];
} {
  const duplicateIds = findDuplicatePersistedNodeIds(value);
  return {
    value: repairDuplicatePersistedNodeIds(value),
    normalized: duplicateIds.length > 0,
    duplicateIds,
  };
}

let fallbackSequence = 0;

function safeTypePrefix(type: string): string {
  const prefix = type.replace(/[^A-Za-z0-9_-]/g, '-').replace(/^-+|-+$/g, '');
  return prefix || 'node';
}

function identityToken(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return randomUuid.replace(/[^A-Za-z0-9_-]/g, '');
  fallbackSequence += 1;
  return `${Date.now().toString(36)}-${fallbackSequence.toString(36)}`;
}

/** Generates an ID and proves it is unused in the supplied document set. */
export function generateFreshNodeId(type: string, usedIds: ReadonlySet<string>): string {
  const prefix = safeTypePrefix(type);
  const token = identityToken();
  const base = `${prefix}-${token}`;
  if (!usedIds.has(base)) return base;

  let suffix = 1;
  while (usedIds.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function nodeType(node: UnknownRecord): string {
  const attributes = isRecord(node.attributes) ? node.attributes : undefined;
  const attributeType = attributes?.[NODE_TYPE_ATTRIBUTE];
  return typeof attributeType === 'string'
    ? attributeType
    : typeof node.type === 'string'
      ? node.type
      : 'node';
}

function isRootNode(node: UnknownRecord): boolean {
  return nodeIds(node).includes('root') || nodeType(node) === 'root';
}

function replaceReference(value: string, idMap: ReadonlyMap<string, string>): string {
  if (idMap.has(value)) return idMap.get(value) ?? value;
  return value
    .split(/(\s+)/)
    .map((part) => idMap.get(part) ?? part)
    .join('');
}

function remapReferences(
  value: unknown,
  key: string,
  idMap: ReadonlyMap<string, string>,
): unknown {
  if (typeof value === 'string' && REFERENCE_KEYS.has(key)) {
    return replaceReference(value, idMap);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => remapReferences(entry, key, idMap));
  }
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      remapReferences(entryValue, entryKey, idMap),
    ]),
  );
}

/**
 * Clones a subtree and assigns every persisted node a fresh, document-safe ID.
 * The editor root sentinel remains `root`; it is structural and is never
 * duplicated by this function.
 */
export function remapSubtreeNodeIds<T>(definition: T, usedIds: ReadonlySet<string>): T {
  const idMap = new Map<string, string>();
  const generatedIds = new WeakMap<UnknownRecord, string>();
  const reserved = new Set(usedIds);

  walkNodes(definition, (node) => {
    const originalIds = nodeIds(node);
    if (isRootNode(node)) {
      originalIds.forEach((id) => idMap.set(id, 'root'));
      return;
    }
    const nextId = generateFreshNodeId(nodeType(node), reserved);
    generatedIds.set(node, nextId);
    originalIds.forEach((id) => idMap.set(id, nextId));
    reserved.add(nextId);
  });

  const transform = (value: unknown, key = ''): unknown => {
    if (Array.isArray(value)) return value.map((entry) => transform(entry, key));
    if (!isRecord(value)) {
      return typeof value === 'string' && REFERENCE_KEYS.has(key)
        ? replaceReference(value, idMap)
        : value;
    }

    const next: UnknownRecord = { ...value };
    const ids = nodeIds(value);
    if (isPersistedNode(value) && !isRootNode(value)) {
      const nextId = generatedIds.get(value) ?? idMap.get(ids[0] ?? '');
      if (nextId) {
        if (typeof value.id === 'string' || !isRecord(value.attributes)) next.id = nextId;
        if (isRecord(value.attributes)) {
          next.attributes = {
            ...value.attributes,
            [NODE_ID_ATTRIBUTE]: nextId,
          };
        }
      }
    } else if (isRootNode(value)) {
      if (typeof value.type === 'string' || typeof value.id === 'string')
        next.id = 'root';
      if (isRecord(value.attributes)) {
        next.attributes = { ...value.attributes, [NODE_ID_ATTRIBUTE]: 'root' };
      }
    }

    if (Array.isArray(value.children))
      next.children = value.children.map((child) => transform(child));
    if (Array.isArray(value.components))
      next.components = value.components.map((child) => transform(child));
    else if (isRecord(value.components)) next.components = transform(value.components);

    Object.entries(next).forEach(([entryKey, entryValue]) => {
      if (entryKey === 'children' || entryKey === 'components') return;
      next[entryKey] = remapReferences(entryValue, entryKey, idMap);
    });
    return next;
  };

  return transform(definition) as T;
}
