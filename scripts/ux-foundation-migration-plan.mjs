import { createHash } from 'node:crypto';

function idString(value) {
  return typeof value === 'string' ? value : String(value ?? '');
}

const designSystemTokenCategories = [
  'colors',
  'typography',
  'spacing',
  'radii',
  'shadows',
  'containerWidths',
];

export function isFullDesignSystem(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    designSystemTokenCategories.every((category) => Array.isArray(value[category])),
  );
}

function stableHex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function diffObject(base, value) {
  if (sameJson(base, value)) return undefined;
  if (
    base &&
    value &&
    typeof base === 'object' &&
    typeof value === 'object' &&
    !Array.isArray(base) &&
    !Array.isArray(value)
  ) {
    const result = {};
    for (const key of new Set([...Object.keys(base), ...Object.keys(value)])) {
      const difference = diffObject(base[key], value[key]);
      if (difference !== undefined) result[key] = difference;
    }
    return Object.keys(result).length ? result : undefined;
  }
  return value;
}

/** Normalize a legacy full snapshot against a deterministic workspace base. */
export function normalizeSiteDesignSystemOverride(workspaceSystem, effectiveSystem) {
  const result = { version: 1 };
  const removedTokenIds = {};
  for (const category of designSystemTokenCategories) {
    const baseline = workspaceSystem[category];
    const next = effectiveSystem[category];
    const baselineById = new Map(baseline.map((token) => [token.id, token]));
    const nextIds = new Set(next.map((token) => token.id));
    const changed = next.filter((token) => !sameJson(baselineById.get(token.id), token));
    const removed = baseline
      .filter((token) => !nextIds.has(token.id))
      .map((token) => token.id);
    if (changed.length) result[category] = changed;
    if (removed.length) removedTokenIds[category] = removed;
  }
  const componentDefaults = {};
  for (const componentType of new Set([
    ...Object.keys(workspaceSystem.componentDefaults ?? {}),
    ...Object.keys(effectiveSystem.componentDefaults ?? {}),
  ])) {
    const difference = diffObject(
      workspaceSystem.componentDefaults?.[componentType],
      effectiveSystem.componentDefaults?.[componentType],
    );
    if (difference) componentDefaults[componentType] = difference;
  }
  if (Object.keys(removedTokenIds).length) result.removedTokenIds = removedTokenIds;
  if (Object.keys(componentDefaults).length) result.componentDefaults = componentDefaults;
  return result;
}

export function deterministicUuid(value) {
  const hex = stableHex(value).slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8).join(''),
    hex.slice(8, 12).join(''),
    hex.slice(12, 16).join(''),
    hex.slice(16, 20).join(''),
    hex.slice(20, 32).join(''),
  ].join('-');
}

export function stableKeySuffix(workspaceId, sourceId, sourceKey) {
  return stableHex(`${workspaceId}:${sourceId}:${sourceKey}`).slice(0, 10);
}

function keyWithSuffix(sourceKey, suffix, sequence = 0) {
  const tail = sequence ? `-${suffix}-${sequence}` : `-${suffix}`;
  return `${sourceKey.slice(0, Math.max(1, 100 - tail.length))}${tail}`;
}

function sortedLegacy(records) {
  return [...records].sort((left, right) =>
    `${idString(left.workspaceId)}:${idString(left.siteId)}:${idString(left._id)}`.localeCompare(
      `${idString(right.workspaceId)}:${idString(right.siteId)}:${idString(right._id)}`,
    ),
  );
}

function allocateKey(record, usedKeys) {
  const workspaceId = idString(record.workspaceId);
  const sourceId = idString(record._id);
  const sourceKey = idString(record.key);
  if (!usedKeys.has(`${workspaceId}:${sourceKey}`)) {
    usedKeys.add(`${workspaceId}:${sourceKey}`);
    return sourceKey;
  }
  const suffix = stableKeySuffix(workspaceId, sourceId, sourceKey);
  let sequence = 0;
  let candidate = keyWithSuffix(sourceKey, suffix);
  while (usedKeys.has(`${workspaceId}:${candidate}`)) {
    sequence += 1;
    candidate = keyWithSuffix(sourceKey, suffix, sequence);
  }
  usedKeys.add(`${workspaceId}:${candidate}`);
  return candidate;
}

/**
 * Plan collection ownership conversion without touching Mongo. Collections
 * keep their ids, so entry/version references remain valid even when a key
 * must be made unique inside a workspace.
 */
export function planCollectionMigrations(legacyRecords, canonicalRecords = []) {
  const usedKeys = new Set(
    canonicalRecords.map(
      (record) => `${idString(record.workspaceId)}:${idString(record.key)}`,
    ),
  );
  return sortedLegacy(legacyRecords).map((record) => ({
    collectionId: idString(record._id),
    workspaceId: idString(record.workspaceId),
    siteId: idString(record.siteId),
    sourceKey: idString(record.key),
    canonicalKey: allocateKey(record, usedKeys),
  }));
}

/**
 * Plan canonical navigation copies while leaving the legacy source rows
 * untouched. `migrationSourceId` makes a rerun recognize its own copy and
 * remain idempotent.
 */
export function planNavigationMigrations(legacyRecords, canonicalRecords = []) {
  const usedKeys = new Set(
    canonicalRecords.map(
      (record) => `${idString(record.workspaceId)}:${idString(record.key)}`,
    ),
  );
  const existingBySource = new Map(
    canonicalRecords
      .filter((record) => record.migrationSourceId)
      .map((record) => [idString(record.migrationSourceId), record]),
  );
  const usedIds = new Set(canonicalRecords.map((record) => idString(record._id)));
  return sortedLegacy(legacyRecords).map((record) => {
    const sourceId = idString(record._id);
    const existing = existingBySource.get(sourceId);
    if (existing) {
      return {
        sourceId,
        canonicalId: idString(existing._id),
        workspaceId: idString(record.workspaceId),
        siteId: idString(record.siteId),
        sourceKey: idString(record.key),
        canonicalKey: idString(existing.key),
        alreadyPresent: true,
      };
    }
    const canonicalKey = allocateKey(record, usedKeys);
    let sequence = 0;
    let canonicalId = deterministicUuid(
      `navigation:${idString(record.workspaceId)}:${sourceId}`,
    );
    while (usedIds.has(canonicalId) || canonicalId === sourceId) {
      sequence += 1;
      canonicalId = deterministicUuid(
        `navigation:${idString(record.workspaceId)}:${sourceId}:${sequence}`,
      );
    }
    usedIds.add(canonicalId);
    return {
      sourceId,
      canonicalId,
      workspaceId: idString(record.workspaceId),
      siteId: idString(record.siteId),
      sourceKey: idString(record.key),
      canonicalKey,
      alreadyPresent: false,
    };
  });
}

export function migrationCollisionReport(records) {
  const groups = new Map();
  for (const record of records) {
    const key = `${idString(record.workspaceId)}:${idString(record.key)}`;
    const rows = groups.get(key) ?? [];
    rows.push(record);
    groups.set(key, rows);
  }
  return [...groups.entries()]
    .filter(([, rows]) => rows.length > 1)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([workspaceKey, rows]) => ({
      workspaceKey,
      ids: sortedLegacy(rows).map((row) => idString(row._id)),
      siteIds: sortedLegacy(rows).map((row) => idString(row.siteId)),
    }));
}
