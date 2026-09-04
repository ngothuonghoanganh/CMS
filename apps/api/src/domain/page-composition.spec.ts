import { describe, expect, it } from 'vitest';
import { ExtensionIds, PagePayloadV3Schema } from '@payload/contracts';

import {
  clonePageCompositionForPage,
  normalizePageComposition,
} from './page-composition';

const pageId = '11111111-1111-4111-8111-111111111111';
const copiedPageId = '33333333-3333-4333-8333-333333333333';
const attachmentId = '44444444-4444-4444-8444-444444444444';

function countdownPayload(attachment?: string) {
  return PagePayloadV3Schema.parse({
    version: 3,
    metadata: { documentTitle: 'Composition test' },
    root: {
      id: 'root',
      type: 'root',
      props: {},
      children: [
        {
          id: 'section',
          type: 'section',
          props: {},
          children: [
            {
              id: 'countdown',
              type: 'countdown',
              props: {
                label: 'Launch',
                targetAt: '2030-01-01T00:00:00.000Z',
                ...(attachment ? { attachmentId: attachment } : {}),
              },
              children: [],
            },
          ],
        },
      ],
    },
  });
}

describe('page composition normalization', () => {
  it('creates a persisted attachment for a legacy visual extension node', () => {
    const composition = normalizePageComposition({
      pageId,
      payload: countdownPayload(),
    });

    expect(composition.attachments).toHaveLength(1);
    expect(composition.attachments[0]).toMatchObject({
      pageId,
      extensionId: ExtensionIds.DemoBuilder,
      enabled: true,
      configuration: {},
    });
  });

  it('keeps attachment identity/configuration stable and drops removed nodes', () => {
    const current = normalizePageComposition({
      pageId,
      payload: countdownPayload(attachmentId),
      composition: {
        payload: countdownPayload(attachmentId),
        attachments: [
          {
            id: attachmentId,
            pageId,
            extensionId: ExtensionIds.DemoBuilder,
            enabled: false,
            configuration: {},
            resourceIds: [],
          },
        ],
        layoutAttachments: [],
        bindings: [],
        actions: [],
        resources: [],
      },
    });

    expect(current.attachments[0]?.id).toBe(attachmentId);
    expect(current.attachments[0]?.enabled).toBe(false);

    const removed = normalizePageComposition({
      pageId,
      payload: PagePayloadV3Schema.parse({
        ...countdownPayload(),
        root: { ...countdownPayload().root, children: [] },
      }),
      previous: current,
    });
    expect(removed.attachments).toEqual([]);
  });

  it('clones visual references and attachment identities independently', () => {
    const source = normalizePageComposition({
      pageId,
      payload: countdownPayload(attachmentId),
      composition: {
        payload: countdownPayload(attachmentId),
        attachments: [
          {
            id: attachmentId,
            pageId,
            extensionId: ExtensionIds.DemoBuilder,
            enabled: true,
            configuration: {},
            resourceIds: [],
          },
        ],
        layoutAttachments: [],
        bindings: [],
        actions: [],
        resources: [],
      },
    });
    const copy = clonePageCompositionForPage(source, copiedPageId);
    const copiedNode = copy.payload.root.children[0]?.children[0];

    expect(copy.pageId).toBe(copiedPageId);
    expect(copy.attachments[0]?.pageId).toBe(copiedPageId);
    expect(copy.attachments[0]?.id).not.toBe(attachmentId);
    expect(copiedNode?.type).toBe('countdown');
    if (copiedNode?.type === 'countdown') {
      expect(copiedNode.props.attachmentId).toBe(copy.attachments[0]?.id);
    }
  });
});
