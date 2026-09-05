import {
  ExtensionIds,
  PageCompositionFieldsSchema,
  type AnyPageNode,
  type PageCompositionFields,
  type PageExtensionAttachment,
  type PagePayload,
} from '@payload/contracts';

type Placement = { extensionId: string; attachmentId?: string };

let fallbackSequence = 0;

function newUuid(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  fallbackSequence += 1;
  return `00000000-0000-4000-8000-${fallbackSequence.toString().padStart(12, '0')}`;
}

function extensionPlacements(root: AnyPageNode): Placement[] {
  const result: Placement[] = [];
  const pending: AnyPageNode[] = [root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (!node) continue;
    if (node.type === 'countdown') {
      result.push({
        extensionId: ExtensionIds.DemoBuilder,
        ...(node.props.attachmentId ? { attachmentId: node.props.attachmentId } : {}),
      });
    } else if (node.type === 'extension') {
      result.push({
        extensionId: node.props.extensionId,
        ...(node.props.attachmentId ? { attachmentId: node.props.attachmentId } : {}),
      });
    }
    pending.push(...node.children);
  }
  return result;
}

/**
 * Derives the page-owned attachment projection from the visual payload. The
 * visual tree owns placement; configuration and lifecycle state stay here.
 */
export function compositionFieldsFromPayload(
  payload: PagePayload,
  pageId: string,
  current?: PageCompositionFields,
): PageCompositionFields {
  const source = current ?? PageCompositionFieldsSchema.parse({});
  const placements = extensionPlacements(payload.root);
  const consumed = new Set<string>();
  const attachments: PageExtensionAttachment[] = [];

  for (const placement of placements) {
    const existing = placement.attachmentId
      ? source.attachments.find((candidate) => candidate.id === placement.attachmentId)
      : source.attachments.find(
          (candidate) =>
            !consumed.has(candidate.id) &&
            candidate.extensionId === placement.extensionId,
        );
    const attachment = existing ?? {
      id: placement.attachmentId ?? newUuid(),
      pageId,
      extensionId: placement.extensionId,
      enabled: true,
      configuration: {},
      resourceIds: [],
    };
    if (attachment.extensionId !== placement.extensionId) {
      // A malformed legacy document should remain editable. The API will
      // reject the mismatch at publish/save validation rather than silently
      // attaching the wrong extension to a visual node.
      continue;
    }
    if (consumed.has(attachment.id)) continue;
    consumed.add(attachment.id);
    attachments.push({ ...attachment, pageId });
  }

  return PageCompositionFieldsSchema.parse({
    attachments,
    layoutAttachments: source.layoutAttachments,
    bindings: source.bindings,
    actions: source.actions,
    resources: source.resources,
    queries: source.queries ?? [],
  });
}

/** Stable equality for save/dirty checks across the complete page document. */
export function pageDocumentSignature(value: unknown): string {
  const normalize = (input: unknown, key = ''): unknown => {
    if (Array.isArray(input)) {
      const normalized = input.map((entry) => normalize(entry, key));
      if (
        [
          'attachments',
          'layoutAttachments',
          'bindings',
          'actions',
          'resources',
          'queries',
        ].includes(key) &&
        normalized.every(
          (entry) =>
            typeof entry === 'object' &&
            entry !== null &&
            typeof (entry as { id?: unknown }).id === 'string',
        )
      ) {
        return [...normalized].sort((left, right) =>
          String((left as { id: string }).id).localeCompare(
            String((right as { id: string }).id),
          ),
        );
      }
      return normalized;
    }
    if (typeof input !== 'object' || input === null) return input;
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([entryKey, entryValue]) => [entryKey, normalize(entryValue, entryKey)]),
    );
  };
  return JSON.stringify(normalize(value));
}
