import { describe, expect, it } from 'vitest';
import { ExtensionIds, PagePayloadV3Schema } from '@payload/contracts';

import { compositionFieldsFromPayload } from './page-composition';

const pageId = '11111111-1111-4111-8111-111111111111';
const attachmentId = '44444444-4444-4444-8444-444444444444';

const payload = PagePayloadV3Schema.parse({
  version: 3,
  metadata: { documentTitle: 'Builder composition' },
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
              attachmentId,
            },
            children: [],
          },
        ],
      },
    ],
  },
});

describe('builder page composition', () => {
  it('hydrates the visual attachment reference without duplicating config state', () => {
    const fields = compositionFieldsFromPayload(payload, pageId, {
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
    });

    expect(fields.attachments).toHaveLength(1);
    expect(fields.attachments[0]).toMatchObject({
      id: attachmentId,
      pageId,
      extensionId: ExtensionIds.DemoBuilder,
      enabled: false,
    });
  });

  it('removes an attachment when its visual node is removed', () => {
    const withoutNode = PagePayloadV3Schema.parse({
      ...payload,
      root: { ...payload.root, children: [] },
    });
    const fields = compositionFieldsFromPayload(withoutNode, pageId, {
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
    });

    expect(fields.attachments).toEqual([]);
  });
});
