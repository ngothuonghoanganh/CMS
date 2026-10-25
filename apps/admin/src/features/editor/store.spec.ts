import { MAX_SECTIONS } from '@plp/contracts';
import { createSectionInstance, getAtPath } from '@plp/sections/schema';
import { describe, expect, it } from 'vitest';
import { MAX_HISTORY, visibilityGroupOf } from './store';
import {
  asset,
  emptyChecks,
  makeStore,
  pageDetail,
  pageSummary,
  sampleComposition,
  sectionById,
  sectionIds,
} from './test-fixtures';

const HERO = 'hero00000001';
const BENEFITS = 'benefits0001';
const FAQ = 'faq000000001';
const NAVBAR = 'navbar000001';
const FOOTER = 'footer000001';

describe('editor store: sections', () => {
  it('adds a section after the requested index, selects it and records one undo step', () => {
    const store = makeStore();
    expect(store.getState().addSection('testimonials', 'quote', 2)).toBe(true);
    const ids = sectionIds(store);
    expect(ids).toHaveLength(6);
    const added = ids[2];
    expect(added).toMatch(/^[a-z0-9]{12}$/);
    const section = sectionById(store, added ?? '');
    expect(section).toMatchObject({ type: 'testimonials', variant: 'quote' });
    expect(section.samplePaths.length).toBeGreaterThan(0);
    expect(store.getState().selection).toEqual({ sectionId: added, fieldPath: null });
    expect(store.getState().history.past).toHaveLength(1);
    expect(store.getState().saveState).toBe('dirty');
  });

  it('keeps added sections between the navigation bar and the footer', () => {
    const store = makeStore();
    store.getState().addSection('cta_band', undefined, 0);
    expect(sectionById(store, sectionIds(store)[1] ?? '').type).toBe('cta_band');
    store.getState().addSection('faq', undefined, 99);
    const ids = sectionIds(store);
    expect(ids[ids.length - 1]).toBe(FOOTER);
    expect(sectionById(store, ids[ids.length - 2] ?? '').type).toBe('faq');
  });

  it('refuses a second singleton, an unknown variant and a page over the section limit', () => {
    const store = makeStore();
    expect(store.getState().addSection('navbar', undefined, 1)).toBe(false);
    expect(store.getState().addSection('footer', undefined, 3)).toBe(false);
    expect(store.getState().addSection('hero', 'nope', 2)).toBe(false);
    expect(sectionIds(store)).toHaveLength(5);
    expect(store.getState().history.past).toHaveLength(0);

    const full = makeStore({
      detail: pageDetail({
        version: 1,
        sections: Array.from({ length: MAX_SECTIONS }, (_value, index) =>
          createSectionInstance('faq', undefined, `faq${String(index).padStart(9, '0')}`),
        ),
      }),
    });
    expect(full.getState().addSection('hero', undefined, 1)).toBe(false);
    expect(full.getState().duplicateSection('faq000000001')).toBe(false);
  });

  it('places a navigation bar first and a footer last when the page has none', () => {
    const composition = sampleComposition();
    composition.sections = composition.sections.filter(
      (section) => section.type !== 'navbar' && section.type !== 'footer',
    );
    const store = makeStore({ detail: pageDetail(composition) });
    expect(store.getState().addSection('navbar', undefined, 2)).toBe(true);
    expect(store.getState().addSection('footer', undefined, 0)).toBe(true);
    const sections = store.getState().draft.composition.sections;
    expect(sections[0]?.type).toBe('navbar');
    expect(sections[sections.length - 1]?.type).toBe('footer');
  });

  it('removes a section and clears the selection that pointed to it', () => {
    const store = makeStore();
    store.getState().select(HERO);
    expect(store.getState().removeSection(HERO)).toBe(true);
    expect(sectionIds(store)).not.toContain(HERO);
    expect(store.getState().selection.sectionId).toBeNull();
    expect(store.getState().removeSection('missing00001')).toBe(false);
  });

  it('duplicates a section right after the original with a new id, but never a singleton', () => {
    const store = makeStore();
    expect(store.getState().duplicateSection(HERO)).toBe(true);
    const ids = sectionIds(store);
    const copyId = ids[2] ?? '';
    expect(copyId).not.toBe(HERO);
    const copy = sectionById(store, copyId);
    const original = sectionById(store, HERO);
    expect(copy.content).toEqual(original.content);
    expect(copy.samplePaths).toEqual(original.samplePaths);
    expect(store.getState().selection.sectionId).toBe(copyId);
    expect(store.getState().duplicateSection(NAVBAR)).toBe(false);
    expect(store.getState().duplicateSection(FOOTER)).toBe(false);
  });

  it('moves sections only where fixed positions allow', () => {
    const store = makeStore();
    expect(store.getState().moveSection(FAQ, 1)).toBe(true);
    expect(sectionIds(store)).toEqual([NAVBAR, FAQ, HERO, BENEFITS, FOOTER]);
    expect(store.getState().moveSection(FAQ, 0)).toBe(false);
    expect(store.getState().moveSection(HERO, 4)).toBe(false);
    expect(store.getState().moveSection(NAVBAR, 2)).toBe(false);
    expect(store.getState().moveSection(FOOTER, 1)).toBe(false);
    // Already there: nothing to do.
    expect(store.getState().moveSection(HERO, 2)).toBe(false);
    expect(sectionIds(store)).toEqual([NAVBAR, FAQ, HERO, BENEFITS, FOOTER]);
    expect(store.getState().history.past).toHaveLength(1);
  });
});

describe('editor store: content', () => {
  it('updates text, removes its sample marker and clamps it to the field maximum', () => {
    const store = makeStore();
    expect(sectionById(store, HERO).samplePaths).toContain('heading');
    expect(store.getState().updateContent(HERO, 'heading', 'x'.repeat(200))).toBe(true);
    const hero = sectionById(store, HERO);
    expect(hero.content.heading).toBe('x'.repeat(80));
    expect(hero.samplePaths).not.toContain('heading');
    expect(hero.samplePaths).toContain('subheading');
  });

  it('clamps button labels and image descriptions, and removes sample markers below a path', () => {
    const store = makeStore();
    store.getState().updateContent(HERO, 'primaryCta.label', 'y'.repeat(90));
    expect(getAtPath(sectionById(store, HERO).content, 'primaryCta.label')).toBe('y'.repeat(40));
    expect(sectionById(store, HERO).samplePaths).not.toContain('primaryCta.label');

    store.getState().updateContent(HERO, 'secondaryCta', {
      label: 'z'.repeat(60),
      link: { kind: 'none' },
    });
    expect(getAtPath(sectionById(store, HERO).content, 'secondaryCta.label')).toBe('z'.repeat(40));

    store.getState().updateContent(HERO, 'image.alt', 'a'.repeat(400));
    expect(getAtPath(sectionById(store, HERO).content, 'image.alt')).toHaveLength(250);

    store.getState().updateContent(BENEFITS, 'items.1', 'ignored');
    store.getState().updateContent(BENEFITS, 'items.1.title', 'Gần như vô hình');
    const benefits = sectionById(store, BENEFITS);
    expect(getAtPath(benefits.content, 'items.1.title')).toBe('Gần như vô hình');
    expect(benefits.samplePaths).not.toContain('items.1.title');
    expect(benefits.samplePaths).toContain('items.0.title');
  });

  it('refuses unknown paths, missing list items and values the schema rejects', () => {
    const store = makeStore();
    const before = store.getState().draft;
    expect(store.getState().updateContent(HERO, 'nope', 'x')).toBe(false);
    expect(store.getState().updateContent(BENEFITS, 'items.7.title', 'x')).toBe(false);
    expect(store.getState().updateContent(BENEFITS, 'items', [])).toBe(false);
    expect(store.getState().updateContent(HERO, 'heading', 42)).toBe(false);
    expect(
      store.getState().updateContent(HERO, 'primaryCta.link', { kind: 'url', url: 'javascript:x' }),
    ).toBe(false);
    expect(store.getState().updateContent('missing00001', 'heading', 'x')).toBe(false);
    expect(store.getState().draft).toBe(before);
  });

  it('merges typing in one field into a single undo step until the step is closed', () => {
    const store = makeStore();
    for (const value of ['N', 'Ni', 'Niề', 'Niềng']) {
      store.getState().updateContent(HERO, 'heading', value, { merge: true });
    }
    expect(store.getState().history.past).toHaveLength(1);
    store.getState().closeHistoryStep();
    store.getState().updateContent(HERO, 'heading', 'Niềng răng', { merge: true });
    expect(store.getState().history.past).toHaveLength(2);
    store.getState().updateContent(HERO, 'eyebrow', 'Ưu đãi', { merge: true });
    expect(store.getState().history.past).toHaveLength(3);

    store.getState().undo();
    store.getState().undo();
    expect(sectionById(store, HERO).content.heading).toBe('Niềng');
  });

  it('ends the typing step when the selection changes, as a field closed by Escape never blurs', () => {
    const store = makeStore();
    store.getState().select(HERO, 'heading');
    store.getState().updateContent(HERO, 'heading', 'Gốc một', { merge: true });
    store.getState().select(null);
    store.getState().select(HERO, 'heading');
    store.getState().updateContent(HERO, 'heading', 'Gốc một hai', { merge: true });
    expect(store.getState().history.past).toHaveLength(2);
    store.getState().undo();
    expect(sectionById(store, HERO).content.heading).toBe('Gốc một');

    // Selecting what is already selected keeps the step open.
    store.getState().updateContent(HERO, 'heading', 'Gốc một ba', { merge: true });
    store.getState().select(HERO, 'heading');
    store.getState().updateContent(HERO, 'heading', 'Gốc một bốn', { merge: true });
    expect(store.getState().history.past).toHaveLength(2);
  });

  it('adds list items up to the maximum with sample markers for the new item', () => {
    const store = makeStore();
    expect(store.getState().addListItem(BENEFITS, 'items')).toBe(true);
    let benefits = sectionById(store, BENEFITS);
    expect(getAtPath(benefits.content, 'items.3.title')).toBe('Lợi ích mới');
    expect(benefits.samplePaths).toContain('items.3.title');
    expect(store.getState().addListItem(BENEFITS, 'items')).toBe(true);
    expect(store.getState().addListItem(BENEFITS, 'items')).toBe(true);
    expect(store.getState().addListItem(BENEFITS, 'items')).toBe(false);
    benefits = sectionById(store, BENEFITS);
    expect(getAtPath(benefits.content, 'items')).toHaveLength(6);
    expect(store.getState().addListItem(BENEFITS, 'heading')).toBe(false);
  });

  it('removes list items down to the minimum and renumbers sample markers', () => {
    const store = makeStore();
    // The alternating layout works with 2 benefits; the grid needs 3.
    store.getState().setVariant(BENEFITS, 'alternate');
    store.getState().updateContent(BENEFITS, 'items.0.title', 'Đã sửa');
    store.getState().select(BENEFITS, 'items.1.title');
    expect(store.getState().removeListItem(BENEFITS, 'items', 1)).toBe(true);
    const benefits = sectionById(store, BENEFITS);
    expect(getAtPath(benefits.content, 'items.1.title')).toBe('Lợi ích thứ ba');
    expect(benefits.samplePaths).toContain('items.1.title');
    expect(benefits.samplePaths).not.toContain('items.2.title');
    expect(benefits.samplePaths).not.toContain('items.0.title');
    expect(store.getState().selection).toEqual({ sectionId: BENEFITS, fieldPath: null });
    expect(store.getState().removeListItem(BENEFITS, 'items', 0)).toBe(false);
    expect(store.getState().removeListItem(BENEFITS, 'items', 9)).toBe(false);
  });

  it('keeps at least 3 benefits in the grid and 3 testimonials in the cards', () => {
    const store = makeStore();
    expect(store.getState().removeListItem(BENEFITS, 'items', 0)).toBe(false);
    expect(getAtPath(sectionById(store, BENEFITS).content, 'items')).toHaveLength(3);

    store.getState().addSection('testimonials', 'quote', 3);
    const quote = sectionIds(store)[3] ?? '';
    expect(store.getState().removeListItem(quote, 'items', 2)).toBe(true);
    expect(store.getState().removeListItem(quote, 'items', 1)).toBe(true);
    expect(getAtPath(sectionById(store, quote).content, 'items')).toHaveLength(1);
  });

  it('reorders list items and moves their sample markers with them', () => {
    const store = makeStore();
    store.getState().updateContent(FAQ, 'items.0.question', 'Câu đã sửa?');
    expect(store.getState().moveListItem(FAQ, 'items', 0, 2)).toBe(true);
    const faq = sectionById(store, FAQ);
    expect(getAtPath(faq.content, 'items.2.question')).toBe('Câu đã sửa?');
    expect(faq.samplePaths).not.toContain('items.2.question');
    expect(faq.samplePaths).toContain('items.0.question');
    expect(faq.samplePaths).toContain('items.2.answer');
    expect(store.getState().moveListItem(FAQ, 'items', 0, 3)).toBe(false);
    expect(store.getState().moveListItem(FAQ, 'items', 1, 1)).toBe(false);
  });
});

describe('editor store: layout and visibility', () => {
  it('sets a known variant only', () => {
    const store = makeStore();
    expect(store.getState().setVariant(HERO, 'centered')).toBe(true);
    expect(sectionById(store, HERO).variant).toBe('centered');
    expect(store.getState().setVariant(HERO, 'grid')).toBe(false);
  });

  it('adds sample items when the new variant needs more of them, in one undo step', () => {
    const store = makeStore();
    store.getState().addSection('testimonials', 'quote', 3);
    const id = sectionIds(store)[3] ?? '';
    store.getState().removeListItem(id, 'items', 2);
    store.getState().removeListItem(id, 'items', 1);
    store.getState().updateContent(id, 'items.0.quote', 'Dịch vụ rất tận tình.');
    const steps = store.getState().history.past.length;

    expect(store.getState().setVariant(id, 'cards')).toBe(true);
    const cards = sectionById(store, id);
    expect(cards.variant).toBe('cards');
    expect(getAtPath(cards.content, 'items')).toHaveLength(3);
    expect(getAtPath(cards.content, 'items.0.quote')).toBe('Dịch vụ rất tận tình.');
    expect(getAtPath(cards.content, 'items.2.quote')).toBe(
      'Nhận xét của khách hàng về trải nghiệm thực tế.',
    );
    expect(cards.samplePaths).toEqual(expect.arrayContaining(['items.1.quote', 'items.2.name']));
    expect(cards.samplePaths).not.toContain('items.0.quote');
    expect(store.getState().history.past).toHaveLength(steps + 1);

    store.getState().undo();
    expect(sectionById(store, id).variant).toBe('quote');
    expect(getAtPath(sectionById(store, id).content, 'items')).toHaveLength(1);
  });

  it('keeps the sample marker of a heading the creation variant hid, so a switch still warns', () => {
    const store = makeStore();
    store.getState().addSection('testimonials', 'quote', 3);
    const id = sectionIds(store)[3] ?? '';
    store.getState().setVariant(id, 'cards');
    const cards = sectionById(store, id);
    expect(cards.content.heading).toBe('Khách hàng nói gì về chúng tôi');
    expect(cards.samplePaths).toContain('heading');
  });

  it('sets color scheme and spacing presets, refusing unknown values', () => {
    const store = makeStore();
    expect(store.getState().setColorScheme(HERO, 'dark')).toBe(true);
    expect(store.getState().setSpacing(HERO, 'spacious')).toBe(true);
    expect(sectionById(store, HERO)).toMatchObject({ colorScheme: 'dark', spacing: 'spacious' });
    // Values arrive from the UI; a wrong one must never reach the draft.
    expect(Reflect.apply(store.getState().setColorScheme, null, [HERO, 'neon'])).toBe(false);
    expect(Reflect.apply(store.getState().setSpacing, null, [HERO, 'huge'])).toBe(false);
  });

  it('records no undo step when a value does not change', () => {
    const store = makeStore();
    expect(store.getState().setSpacing(HERO, 'normal')).toBe(true);
    expect(store.getState().history.past).toHaveLength(0);
    expect(store.getState().saveState).toBe('saved');
  });

  it('toggles the visibility flag of one device group', () => {
    const store = makeStore();
    expect(store.getState().setVisibility(BENEFITS, 'mobile', false)).toBe(true);
    expect(sectionById(store, BENEFITS).visibility).toEqual({ desktop: true, mobile: false });
    expect(store.getState().setVisibility('missing00001', 'desktop', false)).toBe(false);
  });

  it('maps devices to visibility groups: the tablet preview uses the desktop flag', () => {
    expect(visibilityGroupOf('desktop')).toBe('desktop');
    expect(visibilityGroupOf('tablet')).toBe('desktop');
    expect(visibilityGroupOf('mobile')).toBe('mobile');
  });

  it('sets the mobile order only for variants with media', () => {
    const store = makeStore();
    expect(store.getState().setMobileOrder(HERO, 'media-first')).toBe(true);
    expect(sectionById(store, HERO).mobileOrder).toBe('media-first');
    store.getState().setVariant(HERO, 'centered');
    expect(store.getState().setMobileOrder(HERO, 'auto')).toBe(false);
    expect(store.getState().setMobileOrder(FAQ, 'media-first')).toBe(false);
  });

  it('selects existing sections and sets the device', () => {
    const store = makeStore();
    expect(store.getState().select(FAQ, 'items.0.answer')).toBe(true);
    expect(store.getState().selection).toEqual({ sectionId: FAQ, fieldPath: 'items.0.answer' });
    expect(store.getState().select('missing00001')).toBe(false);
    expect(store.getState().select(null)).toBe(true);
    expect(store.getState().selection).toEqual({ sectionId: null, fieldPath: null });
    store.getState().setDevice('mobile');
    expect(store.getState().device).toBe('mobile');
    expect(store.getState().history.past).toHaveLength(0);
  });
});

describe('editor store: SEO and slug', () => {
  it('updates SEO fields within the contract limits', () => {
    const store = makeStore();
    expect(store.getState().updateSeo({ title: 'Niềng răng trong suốt' })).toBe(true);
    expect(store.getState().draft.seo.title).toBe('Niềng răng trong suốt');
    expect(store.getState().updateSeo({ description: 'x'.repeat(401) })).toBe(false);
    expect(store.getState().updateSeo({ shareImageAssetId: 'not-an-id' })).toBe(false);
  });

  it('sets only valid slugs', () => {
    const store = makeStore();
    expect(store.getState().setSlug('uu-dai-thang-12')).toBe(true);
    expect(store.getState().draft.slug).toBe('uu-dai-thang-12');
    expect(store.getState().setSlug('')).toBe(true);
    expect(store.getState().setSlug('Ưu đãi')).toBe(false);
    expect(store.getState().setSlug('abc-')).toBe(false);
    expect(store.getState().setSlug('api')).toBe(false);
    expect(store.getState().setSlug(' abc')).toBe(false);
  });
});

describe('editor store: undo and redo', () => {
  it('undoes and redoes draft changes, including slug and SEO', () => {
    const store = makeStore();
    store.getState().setSlug('moi');
    store.getState().updateSeo({ title: 'Tiêu đề' });
    store.getState().removeSection(FAQ);
    expect(store.getState().undo()).toBe(true);
    expect(sectionIds(store)).toContain(FAQ);
    expect(store.getState().undo()).toBe(true);
    expect(store.getState().draft.seo.title).toBe('');
    expect(store.getState().undo()).toBe(true);
    expect(store.getState().draft.slug).toBe('uu-dai-thang-11');
    expect(store.getState().undo()).toBe(false);
    expect(store.getState().redo()).toBe(true);
    expect(store.getState().draft.slug).toBe('moi');
    expect(store.getState().history.future).toHaveLength(2);
  });

  it('clears the redo stack after a new command', () => {
    const store = makeStore();
    store.getState().setSpacing(HERO, 'compact');
    store.getState().undo();
    expect(store.getState().history.future).toHaveLength(1);
    store.getState().setSpacing(HERO, 'spacious');
    expect(store.getState().history.future).toHaveLength(0);
    expect(store.getState().redo()).toBe(false);
  });

  it('keeps at most 100 undo steps', () => {
    const store = makeStore();
    for (let index = 0; index < MAX_HISTORY + 20; index += 1) {
      store.getState().updateContent(HERO, 'eyebrow', `Bước ${index}`);
    }
    expect(store.getState().history.past).toHaveLength(MAX_HISTORY);
    while (store.getState().undo()) {
      // Walk back to the oldest kept step.
    }
    expect(sectionById(store, HERO).content.eyebrow).toBe('Bước 19');
  });

  it('drops a selection that undo makes invalid', () => {
    const store = makeStore();
    store.getState().addSection('cta_band', undefined, 2);
    expect(store.getState().selection.sectionId).not.toBeNull();
    store.getState().undo();
    expect(store.getState().selection.sectionId).toBeNull();
  });
});

describe('editor store: server state', () => {
  it('tracks unsaved versions through saving and saved', () => {
    const store = makeStore();
    store.getState().setSpacing(HERO, 'compact');
    const version = store.getState().draftVersion;
    store.getState().markSaving();
    store.getState().setSpacing(HERO, 'spacious');
    expect(store.getState().saveState).toBe('saving');
    const page = pageSummary({ title: 'Đã lưu' });
    store
      .getState()
      .applySaved(
        { revision: 4, updatedAt: '2026-10-24T09:00:00.000Z', page, checks: emptyChecks },
        version,
      );
    expect(store.getState()).toMatchObject({
      baseRevision: 4,
      saveState: 'dirty',
      lastSavedAt: '2026-10-24T09:00:00.000Z',
      page,
    });
  });

  it('keeps a conflict until the draft is replaced from the server', () => {
    const store = makeStore();
    store.getState().setSpacing(HERO, 'compact');
    store.getState().markConflict();
    store.getState().setSpacing(HERO, 'spacious');
    store.getState().markSaveFailed({ kind: 'retryable', message: 'x' });
    expect(store.getState().saveState).toBe('conflict');

    const fresh = pageDetail();
    fresh.draft.revision = 9;
    store.getState().select(HERO);
    store.getState().replaceDraftFromServer(fresh, []);
    expect(store.getState()).toMatchObject({
      saveState: 'saved',
      baseRevision: 9,
      history: { past: [], future: [] },
    });
    expect(sectionById(store, HERO).spacing).toBe('normal');
    expect(store.getState().selection.sectionId).toBe(HERO);
    expect(store.getState().draftVersion).toBe(store.getState().savedVersion);
  });

  it('adds the assets of a draft replaced from the server, keeping the ones it had', () => {
    const store = makeStore({ assets: [] });
    const other = { ...asset, id: '64b0000000000000000000aa' };
    store.getState().addAssets([other]);
    store.getState().replaceDraftFromServer(pageDetail(), [asset]);
    expect(Object.keys(store.getState().assetsById).sort()).toEqual([asset.id, other.id].sort());
  });

  it('adds uploaded assets to the canvas map', () => {
    const store = makeStore({ assets: [] });
    expect(store.getState().assetsById).toEqual({});
    const uploaded = { ...makeStore().getState().assetsById };
    store.getState().addAssets(Object.values(uploaded));
    expect(Object.keys(store.getState().assetsById)).toHaveLength(1);
  });
});
