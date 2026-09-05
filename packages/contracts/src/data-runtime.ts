import type { PageBinding } from './extension-platform';
import type { ResolvedDataContext, ResolvedDataRecord } from './collections';

const safePath = /^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*)*$/;

export function readDataPath(value: unknown, path: string): unknown {
  if (!safePath.test(path)) return undefined;
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object' || Array.isArray(current))
      return undefined;
    return Object.prototype.hasOwnProperty.call(current, segment)
      ? (current as Record<string, unknown>)[segment]
      : undefined;
  }, value);
}

export type RuntimeDataContext = ResolvedDataContext & {
  currentItem?: ResolvedDataRecord;
};

export function resolveBinding(
  binding: PageBinding,
  context: RuntimeDataContext,
): unknown {
  const { source } = binding;
  let sourceValue: unknown;
  if (source.type === 'current-entry') sourceValue = context.currentEntry?.values;
  else if (source.type === 'query-item' || source.type === 'query') {
    sourceValue =
      context.currentItem?.values ??
      (source.sourceId ? context.queryItems[source.sourceId]?.[0]?.values : undefined);
  } else if (source.type === 'variable')
    sourceValue = source.sourceId
      ? context.variables[source.sourceId]
      : context.variables;
  else sourceValue = undefined;

  const value = readDataPath(sourceValue, source.path);
  if (value === undefined) return binding.fallback;
  if (source.template && typeof value !== 'object') {
    return source.template.replace('{value}', String(value));
  }
  return value;
}

export function resolveNodeProperty(
  bindings: readonly PageBinding[],
  nodeId: string,
  property: string,
  context: RuntimeDataContext,
  fallback: unknown,
): unknown {
  const binding = bindings.find(
    (candidate) =>
      candidate.targetNodeId === nodeId && candidate.targetProperty === property,
  );
  if (!binding) return fallback;
  const value = resolveBinding(binding, context);
  return value === undefined || value === null ? fallback : value;
}
