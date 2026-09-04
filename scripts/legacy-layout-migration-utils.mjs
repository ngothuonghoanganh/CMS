import { createHash } from 'node:crypto';

export function uuidFor(seed) {
  const hex = createHash('sha256').update(seed).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function legacyDocument(value, kind) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const document = clone(value);
  const expectedDocumentKind = kind === 'header' ? 'site-header' : 'site-footer';
  if (
    document.version !== 1 ||
    document.documentKind !== expectedDocumentKind ||
    !document.root ||
    typeof document.root !== 'object' ||
    !Array.isArray(document.root.children)
  ) {
    return null;
  }
  return document;
}

export function legacyGlobal(site, source, kind) {
  const globals = source === 'draft' ? site.globalsDraft : site.publishedGlobals;
  return legacyDocument(globals?.[kind], kind);
}

export function layoutSlot(kind) {
  return kind === 'header' ? 'page.header.top' : 'page.footer.bottom';
}
