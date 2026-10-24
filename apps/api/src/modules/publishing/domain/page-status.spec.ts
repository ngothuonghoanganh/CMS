import { describe, expect, it } from 'vitest';
import { cleanSeo, composition, heroSection } from '../../../../test/compositions.js';
import { derivePageStatus } from './page-status.js';

const hero = heroSection({ id: 'hero00000001' });
const draftBase = { slug: 'uu-dai', composition: composition([hero]), seo: cleanSeo() };

describe('derivePageStatus', () => {
  it('is "draft" before the first release', () => {
    expect(
      derivePageStatus({
        releaseCount: 0,
        liveRelease: null,
        draft: { ...draftBase, revision: 3 },
      }),
    ).toEqual({ kind: 'draft', changeCount: 0, changes: [] });
  });

  it('is "unpublished" when releases exist but nothing is live', () => {
    expect(
      derivePageStatus({
        releaseCount: 2,
        liveRelease: null,
        draft: { ...draftBase, revision: 3 },
      }),
    ).toEqual({ kind: 'unpublished', changeCount: 0, changes: [] });
  });

  it('is "live" while the draft is the revision the live release was made from', () => {
    expect(
      derivePageStatus({
        releaseCount: 1,
        liveRelease: { ...draftBase, sourceRevision: 3 },
        draft: { ...draftBase, revision: 3 },
      }),
    ).toEqual({ kind: 'live', changeCount: 0, changes: [] });
  });

  it('is "live_with_changes" with the diff from the live release once the draft moved on', () => {
    const status = derivePageStatus({
      releaseCount: 1,
      liveRelease: { ...draftBase, sourceRevision: 3 },
      draft: {
        ...draftBase,
        composition: composition([{ ...hero, colorScheme: 'dark' }]),
        seo: cleanSeo({ title: 'Tiêu đề mới' }),
        revision: 5,
      },
    });
    expect(status).toEqual({
      kind: 'live_with_changes',
      changeCount: 2,
      changes: [
        { kind: 'modified', label: 'Sửa: Hero', sectionId: hero.id },
        { kind: 'seo', label: 'SEO: tiêu đề', sectionId: null },
      ],
    });
  });

  it('follows the revision, not the content: a later revision is "live_with_changes" even when equal', () => {
    expect(
      derivePageStatus({
        releaseCount: 1,
        liveRelease: { ...draftBase, sourceRevision: 3 },
        draft: { ...draftBase, revision: 4 },
      }),
    ).toEqual({ kind: 'live_with_changes', changeCount: 0, changes: [] });
  });
});
