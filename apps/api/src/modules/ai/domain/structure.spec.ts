import { goalOutline } from '@plp/sections/schema';
import { describe, expect, it } from 'vitest';
import { compositionFromStructure } from './structure.js';

function ids(): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `sec${String(next).padStart(9, '0')}`;
  };
}

describe('the draft an AI job starts from (ADR-031)', () => {
  it('follows the goal’s outline with its sample copy, colors and form link', () => {
    const structure = goalOutline('lead').map(({ type, variant }) => ({ type, variant }));
    const result = compositionFromStructure({
      structure,
      goal: 'lead',
      siteName: 'Nha khoa Smile Care',
      newId: ids(),
    });
    if (!result.ok) {
      throw new Error(JSON.stringify(result.issues));
    }
    const { sections } = result.composition;
    expect(sections.map((section) => section.type)).toEqual(structure.map((item) => item.type));
    expect(sections.map((section) => section.id)).toEqual(
      sections.map((_section, index) => `sec${String(index + 1).padStart(9, '0')}`),
    );
    const benefits = sections.find((section) => section.type === 'benefits');
    expect(benefits?.content['heading']).toBe('Vì sao chọn Nha khoa Smile Care');
    expect(benefits?.samplePaths).toContain('heading');
    expect(sections.map((section) => section.colorScheme)).toEqual([
      'light',
      'soft',
      'light',
      'soft',
      'light',
      'soft',
      'dark',
    ]);
    const form = sections.find((section) => section.type === 'lead_form');
    const hero = sections.find((section) => section.type === 'hero');
    expect(hero?.content['primaryCta']).toMatchObject({
      link: { kind: 'section', sectionId: form?.id },
    });
    // The brief has no phone to call: the navigation bar's button leads to the form too, so a new
    // AI page is not blocked by a button without a target.
    const navbar = sections.find((section) => section.type === 'navbar');
    expect(navbar?.content['cta']).toMatchObject({
      link: { kind: 'section', sectionId: form?.id },
    });
    expect(sections.every((section) => section.reviewPaths.length === 0)).toBe(true);
  });

  it('leads a call-to-action band to the form, wherever the user placed it', () => {
    const result = compositionFromStructure({
      structure: [
        { type: 'navbar', variant: 'logo-cta' },
        { type: 'hero', variant: 'split' },
        { type: 'lead_form', variant: 'stacked' },
        { type: 'cta_band', variant: 'band' },
        { type: 'footer', variant: 'basic' },
      ],
      goal: 'lead',
      siteName: 'Smile Care',
      newId: ids(),
    });
    if (!result.ok) {
      throw new Error(JSON.stringify(result.issues));
    }
    const form = result.composition.sections.find((section) => section.type === 'lead_form');
    const band = result.composition.sections.find((section) => section.type === 'cta_band');
    expect(band?.content['cta']).toMatchObject({ link: { kind: 'section', sectionId: form?.id } });
  });

  it('takes the section’s own sample for a section the goal does not have, and no form link', () => {
    const result = compositionFromStructure({
      structure: [
        { type: 'hero', variant: 'centered' },
        { type: 'quick_contact', variant: 'buttons' },
      ],
      goal: 'about',
      siteName: 'Smile Care',
      newId: ids(),
    });
    expect(result.ok && result.composition.sections[1]?.content['heading']).toBe(
      'Cần tư vấn ngay?',
    );
    expect(result.ok && result.composition.sections[0]?.content['primaryCta']).toMatchObject({
      link: { kind: 'none' },
    });
  });

  it('refuses unknown variants, and places and counts the registry refuses', () => {
    const unknown = compositionFromStructure({
      structure: [{ type: 'hero', variant: 'nope' }],
      goal: 'lead',
      siteName: 'Smile Care',
      newId: ids(),
    });
    expect(unknown).toEqual({
      ok: false,
      issues: [
        {
          path: ['structure', 0, 'variant'],
          code: 'invalid_variant',
          message: 'Kiểu bố cục "nope" không có trong section Hero',
        },
      ],
    });
    const misplaced = compositionFromStructure({
      structure: [
        { type: 'hero', variant: 'split' },
        { type: 'navbar', variant: 'logo-cta' },
        { type: 'lead_form', variant: 'stacked' },
        { type: 'lead_form', variant: 'stacked' },
      ],
      goal: 'lead',
      siteName: 'Smile Care',
      newId: ids(),
    });
    expect(misplaced.ok ? [] : misplaced.issues.map(({ path, code }) => ({ path, code }))).toEqual([
      { path: ['structure', 1, 'type'], code: 'invalid_position' },
      { path: ['structure', 3, 'type'], code: 'duplicate_singleton' },
    ]);
  });
});
