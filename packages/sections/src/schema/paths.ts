/**
 * Content paths are dot-separated keys and list indices, e.g. "items.2.title".
 * These helpers never mutate their input.
 */
export type ContentPath = string;

export function splitPath(path: ContentPath): (string | number)[] {
  return path.split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

export function getAtPath(value: unknown, path: ContentPath): unknown {
  let current: unknown = value;
  for (const part of splitPath(path)) {
    if (Array.isArray(current) && typeof part === 'number') {
      current = current[part];
    } else if (current !== null && typeof current === 'object' && typeof part === 'string') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function setIn(container: unknown, parts: (string | number)[], next: unknown): unknown {
  const [head, ...rest] = parts;
  if (head === undefined) {
    return next;
  }
  if (typeof head === 'number') {
    if (!Array.isArray(container) || head < 0 || head >= container.length) {
      throw new Error(`Content path index ${head} does not exist`);
    }
    const copy: unknown[] = [...(container as readonly unknown[])];
    copy[head] = setIn(copy[head], rest, next);
    return copy;
  }
  if (container === null || typeof container !== 'object' || Array.isArray(container)) {
    throw new Error(`Content path segment "${head}" does not point into an object`);
  }
  const record = container as Record<string, unknown>;
  return { ...record, [head]: setIn(record[head], rest, next) };
}

export function setAtPath<T>(value: T, path: ContentPath, next: unknown): T {
  return setIn(value, splitPath(path), next) as T;
}

/** True when `path` is `prefix` or lies underneath it ("items.1.title" is under "items.1"). */
export function isPathWithin(path: ContentPath, prefix: ContentPath): boolean {
  return path === prefix || path.startsWith(`${prefix}.`);
}
