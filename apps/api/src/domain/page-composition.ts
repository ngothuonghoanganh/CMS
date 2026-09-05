import {
  ExtensionIds,
  PageCompositionInputSchema,
  PageCompositionSchema,
  PagePayloadSchema,
  type AnyPageNode,
  type PageComposition,
  type PageCompositionFields,
  type PageCompositionInput,
  type PageExtensionAttachment,
  type PageLayoutAttachment,
  type PagePayload,
} from '@payload/contracts';
import { randomUUID } from 'node:crypto';

type ExtensionPlacement = {
  extensionId: string;
  attachmentId?: string;
};

export class PageCompositionError extends Error {
  constructor(
    readonly code: 'EXTENSION_NODE_ATTACHMENT_MISMATCH' | 'PAGE_COMPOSITION_INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'PageCompositionError';
  }
}

export function emptyPageCompositionFields(): PageCompositionFields {
  return {
    attachments: [],
    layoutAttachments: [],
    bindings: [],
    actions: [],
    resources: [],
    queries: [],
  };
}

/**
 * Normalizes a draft into the one persisted composition shape. Legacy payload
 * versions without attachment references are supported by matching one
 * existing attachment per extension, then generating a new attachment when
 * the payload first introduces an extension.
 */
export function normalizePageComposition(input: {
  pageId: string;
  payload: PagePayload;
  composition?: PageCompositionInput | undefined;
  previous?: PageComposition | undefined;
  legacyLayoutAttachments?: readonly PageLayoutAttachment[] | undefined;
}): PageComposition {
  const parsedPayload = PagePayloadSchema.parse(input.payload);
  const supplied = input.composition
    ? PageCompositionInputSchema.parse(input.composition)
    : undefined;
  if (supplied?.pageId && supplied.pageId !== input.pageId) {
    throw new PageCompositionError(
      'PAGE_COMPOSITION_INVALID',
      'Page composition pageId does not match the requested page',
    );
  }
  if (supplied && JSON.stringify(supplied.payload) !== JSON.stringify(parsedPayload)) {
    throw new PageCompositionError(
      'PAGE_COMPOSITION_INVALID',
      'Page composition payload does not match the version payload',
    );
  }

  const source = supplied ?? input.previous;
  const sourceAttachments = source?.attachments ?? [];
  const placements = collectExtensionPlacements(parsedPayload.root);
  const consumed = new Set<string>();
  const attachments: PageExtensionAttachment[] = [];

  for (const placement of placements) {
    let existing: PageExtensionAttachment | undefined;
    if (placement.attachmentId) {
      existing = sourceAttachments.find(
        (candidate) => candidate.id === placement.attachmentId,
      );
      if (!existing) {
        throw new PageCompositionError(
          'EXTENSION_NODE_ATTACHMENT_MISMATCH',
          `Extension node references missing attachment ${placement.attachmentId}`,
        );
      }
    } else {
      existing = sourceAttachments.find(
        (candidate) =>
          !consumed.has(candidate.id) && candidate.extensionId === placement.extensionId,
      );
    }

    if (existing) {
      if (consumed.has(existing.id)) {
        throw new PageCompositionError(
          'EXTENSION_NODE_ATTACHMENT_MISMATCH',
          `Attachment ${existing.id} is referenced by more than one visual extension node`,
        );
      }
      if (existing.extensionId !== placement.extensionId) {
        throw new PageCompositionError(
          'EXTENSION_NODE_ATTACHMENT_MISMATCH',
          `Attachment ${existing.id} belongs to ${existing.extensionId}, not ${placement.extensionId}`,
        );
      }
      consumed.add(existing.id);
      attachments.push({ ...existing, pageId: input.pageId });
      continue;
    }

    const id = placement.attachmentId ?? randomUUID();
    consumed.add(id);
    attachments.push({
      id,
      pageId: input.pageId,
      extensionId: placement.extensionId,
      enabled: true,
      configuration: {},
      resourceIds: [],
    });
  }

  const fields = source ?? emptyPageCompositionFields();
  return PageCompositionSchema.parse({
    pageId: input.pageId,
    payload: parsedPayload,
    attachments,
    layoutAttachments:
      supplied?.layoutAttachments ??
      input.previous?.layoutAttachments ??
      input.legacyLayoutAttachments ??
      fields.layoutAttachments,
    bindings: supplied?.bindings ?? fields.bindings,
    actions: supplied?.actions ?? fields.actions,
    resources: supplied?.resources ?? fields.resources,
    queries: supplied?.queries ?? fields.queries ?? [],
  });
}

/** Clone a page composition without sharing attachment or layout identities. */
export function clonePageCompositionForPage(
  source: PageComposition,
  pageId: string,
): PageComposition {
  const attachmentIds = new Map(
    source.attachments.map((attachment) => [attachment.id, randomUUID()]),
  );
  const queryIds = new Map(source.queries.map((query) => [query.id, randomUUID()]));
  const payload = PagePayloadSchema.parse(
    remapPayloadReferences(source.payload, attachmentIds, queryIds),
  );
  const layoutAttachments = source.layoutAttachments.map((attachment) => ({
    ...attachment,
    id: randomUUID(),
  }));
  return PageCompositionSchema.parse({
    ...source,
    pageId,
    payload,
    attachments: source.attachments.map((attachment) => ({
      ...attachment,
      id: attachmentIds.get(attachment.id) ?? randomUUID(),
      pageId,
    })),
    layoutAttachments,
    queries: source.queries.map((query) => ({
      ...query,
      id: queryIds.get(query.id) ?? randomUUID(),
    })),
    bindings: source.bindings.map((binding) => ({
      ...binding,
      id: randomUUID(),
      source: {
        ...binding.source,
        ...(binding.source.sourceId && queryIds.has(binding.source.sourceId)
          ? { sourceId: queryIds.get(binding.source.sourceId) }
          : {}),
      },
    })),
  });
}

export function collectExtensionPlacements(root: AnyPageNode): ExtensionPlacement[] {
  const result: ExtensionPlacement[] = [];
  const pending: AnyPageNode[] = [root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (!node) continue;
    if (node.type === 'countdown') {
      result.push({
        extensionId: ExtensionIds.DemoBuilder,
        ...('attachmentId' in node.props && node.props.attachmentId
          ? { attachmentId: node.props.attachmentId }
          : {}),
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

function remapPayloadReferences(
  payload: PagePayload,
  attachmentIds: ReadonlyMap<string, string>,
  queryIds: ReadonlyMap<string, string>,
): PagePayload {
  const remap = (node: AnyPageNode): AnyPageNode => {
    const nextProps =
      node.type === 'countdown' || node.type === 'extension'
        ? {
            ...node.props,
            ...(node.props.attachmentId
              ? { attachmentId: attachmentIds.get(node.props.attachmentId) }
              : {}),
          }
        : node.type === 'collection-list'
          ? {
              ...node.props,
              queryId: queryIds.get(node.props.queryId) ?? node.props.queryId,
            }
          : node.props;
    return {
      ...node,
      props: nextProps,
      children: node.children.map(remap),
    } as AnyPageNode;
  };
  return { ...payload, root: remap(payload.root) } as PagePayload;
}
