import type { Composition } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { getAtPath, setAtPath } from './paths.js';
import { createSectionInstance, parseComposition } from './registry.js';
import { compositionHasForm, compositionOutline, withFreshSectionIds } from './template-content.js';
import { buildCompositionFromTemplate, findSystemTemplate } from './templates.js';

function idGenerator(prefix: string): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `${prefix}${String(next).padStart(8, '0')}`;
  };
}

function dentalOffer(): Composition {
  const template = findSystemTemplate('nha-khoa-uu-dai');
  if (!template) {
    throw new Error('No system template "nha-khoa-uu-dai"');
  }
  return buildCompositionFromTemplate(template, idGenerator('old'));
}

describe('withFreshSectionIds', () => {
  it('gives every section a new id and keeps buttons leading to the same section', () => {
    const original = dentalOffer();
    const fresh = withFreshSectionIds(original, idGenerator('new'));

    expect(fresh.sections.map((section) => section.id)).toEqual(
      original.sections.map((_section, index) => `new${String(index + 1).padStart(8, '0')}`),
    );
    const formIndex = original.sections.findIndex((section) => section.type === 'lead_form');
    const formId = fresh.sections[formIndex]?.id;
    const hero = fresh.sections.find((section) => section.type === 'hero');
    const navbar = fresh.sections.find((section) => section.type === 'navbar');
    expect(getAtPath(hero?.content, 'primaryCta.link')).toEqual({
      kind: 'section',
      sectionId: formId,
    });
    expect(getAtPath(navbar?.content, 'cta.link')).toEqual({ kind: 'section', sectionId: formId });
    // Everything but the ids and the links is the same, and the registry still accepts it.
    expect(
      fresh.sections.map(({ type, variant, samplePaths }) => ({ type, variant, samplePaths })),
    ).toEqual(
      original.sections.map(({ type, variant, samplePaths }) => ({ type, variant, samplePaths })),
    );
    expect(parseComposition(fresh).success).toBe(true);
  });

  it('leaves a button leading elsewhere as it was, and never touches the original', () => {
    const hero = createSectionInstance('hero', 'split', 'hero00000001');
    const elsewhere = setAtPath(hero, 'content.primaryCta.link', {
      kind: 'section',
      sectionId: 'gone00000001',
    });
    const original: Composition = { version: 1, sections: [elsewhere] };
    const before = structuredClone(original);
    const fresh = withFreshSectionIds(original, idGenerator('new'));
    expect(getAtPath(fresh.sections[0]?.content, 'primaryCta.link')).toEqual({
      kind: 'section',
      sectionId: 'gone00000001',
    });
    expect(original).toEqual(before);
  });
});

describe('compositionOutline', () => {
  it('names each section by its type and its own summary, with its look', () => {
    const outline = compositionOutline(dentalOffer());
    const hero = outline.find((section) => section.type === 'hero');
    expect(hero?.label).toMatch(/^Hero · /);
    expect(outline.map((section) => section.type)).toEqual(
      dentalOffer().sections.map((section) => section.type),
    );
    for (const section of outline) {
      expect(section.label.length).toBeLessThanOrEqual(80);
    }
  });

  it('says whether the page has a form', () => {
    expect(compositionHasForm(dentalOffer())).toBe(true);
    expect(
      compositionHasForm({
        version: 1,
        sections: [createSectionInstance('hero', 'split', 'hero00000001')],
      }),
    ).toBe(false);
  });
});
