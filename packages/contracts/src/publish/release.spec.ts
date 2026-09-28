import { describe, expect, it } from 'vitest';

import { DraftSchema, ReleaseSchema } from './release';

const ids = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  siteId: '22222222-2222-4222-8222-222222222222',
  pageId: '33333333-3333-4333-8333-333333333333',
  draftId: '44444444-4444-4444-8444-444444444444',
  releaseId: '55555555-5555-4555-8555-555555555555',
};

const composition = {
  version: 1 as const,
  root: { id: 'root', type: 'root' as const, props: {}, children: [] },
  settings: {},
};

describe('canonical draft and release contracts', () => {
  it('keeps Draft editable and Release snapshot-shaped', () => {
    const draft = DraftSchema.parse({
      workspaceId: ids.workspaceId,
      siteId: ids.siteId,
      pageId: ids.pageId,
      id: ids.draftId,
      versionNumber: 1,
      composition,
      createdAt: '2026-09-29T00:00:00.000Z',
      updatedAt: '2026-09-29T00:00:00.000Z',
    });
    const release = ReleaseSchema.parse({
      workspaceId: ids.workspaceId,
      siteId: ids.siteId,
      pageId: ids.pageId,
      id: ids.releaseId,
      releaseNumber: 1,
      sourceDraftId: ids.draftId,
      composition: draft.composition,
      publishedAt: '2026-09-29T00:00:00.000Z',
      createdAt: '2026-09-29T00:00:00.000Z',
    });

    expect(release).toMatchObject({ releaseNumber: 1, sourceDraftId: ids.draftId });
    expect(release).not.toHaveProperty('updatedAt');
  });
});
