import type { NavigationItem } from '@payload/contracts';

export function createNavigationItemId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `00000000-0000-4000-8000-${Date.now().toString().padStart(12, '0')}`;
}

export function findNavigationItem(
  items: readonly NavigationItem[],
  id: string,
): NavigationItem | undefined {
  for (const item of items) {
    if (item.id === id) return item;
    const nested = item.children ? findNavigationItem(item.children, id) : undefined;
    if (nested) return nested;
  }
  return undefined;
}

export function flattenNavigationItems(
  items: readonly NavigationItem[],
): NavigationItem[] {
  return items.flatMap((item) => [
    item,
    ...(item.children ? flattenNavigationItems(item.children) : []),
  ]);
}

function updateChildren(
  items: readonly NavigationItem[],
  id: string,
  update: (item: NavigationItem) => NavigationItem,
): NavigationItem[] {
  return items.map((item) => {
    if (item.id === id) return update(item);
    if (!item.children) return item;
    return { ...item, children: updateChildren(item.children, id, update) };
  });
}

export function updateNavigationItem(
  items: readonly NavigationItem[],
  id: string,
  update: (item: NavigationItem) => NavigationItem,
): NavigationItem[] {
  return updateChildren(items, id, update);
}

export function removeNavigationItem(
  items: readonly NavigationItem[],
  id: string,
): NavigationItem[] {
  const without = items.filter((item) => item.id !== id);
  if (without.length !== items.length) return without;
  return items.map((item) =>
    item.children ? { ...item, children: removeNavigationItem(item.children, id) } : item,
  );
}

function mapSiblings(
  items: readonly NavigationItem[],
  id: string,
  move: (siblings: NavigationItem[], index: number) => NavigationItem[],
): { items: NavigationItem[]; changed: boolean } {
  const index = items.findIndex((item) => item.id === id);
  if (index >= 0) return { items: move([...items], index), changed: true };
  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex];
    if (!item?.children) continue;
    const result = mapSiblings(item.children, id, move);
    if (result.changed) {
      const next = [...items];
      next[itemIndex] = { ...item, children: result.items };
      return { items: next, changed: true };
    }
  }
  return { items: [...items], changed: false };
}

export function moveNavigationItem(
  items: readonly NavigationItem[],
  id: string,
  offset: -1 | 1,
): NavigationItem[] {
  return mapSiblings(items, id, (siblings, index) => {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= siblings.length) return siblings;
    const [item] = siblings.splice(index, 1);
    if (item) siblings.splice(nextIndex, 0, item);
    return siblings;
  }).items;
}

export function indentNavigationItem(
  items: readonly NavigationItem[],
  id: string,
): NavigationItem[] {
  return mapSiblings(items, id, (siblings, index) => {
    if (index === 0) return siblings;
    const [item] = siblings.splice(index, 1);
    const previous = siblings[index - 1];
    if (!item || !previous) return siblings;
    siblings[index - 1] = {
      ...previous,
      children: [...(previous.children ?? []), item],
    };
    return siblings;
  }).items;
}

function navigationPath(
  items: readonly NavigationItem[],
  id: string,
  parents: string[] = [],
): string[] | undefined {
  for (const item of items) {
    if (item.id === id) return [...parents, item.id];
    if (item.children) {
      const path = navigationPath(item.children, id, [...parents, item.id]);
      if (path) return path;
    }
  }
  return undefined;
}

export function outdentNavigationItem(
  items: readonly NavigationItem[],
  id: string,
): NavigationItem[] {
  const path = navigationPath(items, id);
  if (!path || path.length < 2) return [...items];
  const parentId = path[path.length - 2];
  const grandparentId = path[path.length - 3];
  const item = findNavigationItem(items, id);
  if (!item || !parentId) return [...items];
  const without = removeNavigationItem(items, id);
  const insertAfter = (siblings: NavigationItem[]): NavigationItem[] => {
    const index = siblings.findIndex((candidate) => candidate.id === parentId);
    if (index < 0) return siblings;
    const next = [...siblings];
    next.splice(index + 1, 0, item);
    return next;
  };
  return grandparentId
    ? updateNavigationItem(without, grandparentId, (parent) => ({
        ...parent,
        children: insertAfter(parent.children ?? []),
      }))
    : insertAfter(without);
}

function cloneWithFreshIds(item: NavigationItem): NavigationItem {
  return {
    ...item,
    id: createNavigationItemId(),
    ...(item.children
      ? { children: item.children.map((child) => cloneWithFreshIds(child)) }
      : {}),
  };
}

export function duplicateNavigationItem(
  items: readonly NavigationItem[],
  id: string,
): NavigationItem[] {
  return mapSiblings(items, id, (siblings, index) => {
    const source = siblings[index];
    if (!source) return siblings;
    siblings.splice(index + 1, 0, cloneWithFreshIds(source));
    return siblings;
  }).items;
}
