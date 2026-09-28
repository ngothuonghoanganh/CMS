/** Collect page references without recursively walking an untrusted tree. */
export function collectNavigationPageIds(value: unknown): string[] {
  const ids = new Set<string>();
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }
    if (!current || typeof current !== 'object') continue;
    const record = current as Record<string, unknown>;
    if (
      (record.type === 'page' || record.type === 'section') &&
      typeof record.pageId === 'string'
    ) {
      ids.add(record.pageId);
    }
    pending.push(...Object.values(record));
  }
  return [...ids];
}
