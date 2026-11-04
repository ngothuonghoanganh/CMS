import type { SectionInstance, SectionType } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { aiActionPaths, aiWritablePaths, copyPlanOf, isEmptyPlan } from './ai-copy.js';
import { setAtPath } from './paths.js';
import { createSectionInstance } from './registry.js';

const ID = 'abcdefgh1234';

function section(type: SectionType, variant?: string): SectionInstance {
  return createSectionInstance(type, variant, ID);
}

describe('the text the AI may write in a section (ADR-031)', () => {
  it('lists the text fields, the labels of buttons in use and each list item’s text', () => {
    // The sample's secondary button has no label: it is not in use, so it gets none.
    expect(aiWritablePaths(section('hero', 'split'))).toEqual([
      'eyebrow',
      'heading',
      'subheading',
      'primaryCta.label',
    ]);
    expect(aiWritablePaths(section('faq'))).toEqual([
      'heading',
      'items.0.question',
      'items.0.answer',
      'items.1.question',
      'items.1.answer',
      'items.2.question',
      'items.2.answer',
    ]);
  });

  it('never lists links, images, captions of photos, real customers’ words or the footer', () => {
    for (const type of ['hero', 'benefits', 'quick_contact', 'navbar'] as const) {
      for (const path of aiWritablePaths(section(type))) {
        expect(path).not.toMatch(/(link|image|icon|href|phone)/i);
      }
    }
    expect(aiWritablePaths(section('testimonials', 'cards'))).toEqual(['heading']);
    expect(aiWritablePaths(section('before_after'))).toEqual(['heading', 'note']);
    expect(aiWritablePaths(section('navbar'))).toEqual(['cta.label']);
    expect(isEmptyPlan(copyPlanOf(section('footer')))).toBe(true);
    expect(aiWritablePaths(section('footer'))).toEqual([]);
  });

  it('writes what a figure means but never the figure itself, which only the business knows', () => {
    expect(aiWritablePaths(section('stats'))).toEqual([
      'heading',
      'items.0.label',
      'items.1.label',
      'items.2.label',
    ]);
    expect(copyPlanOf(section('stats')).lists).toEqual([
      expect.objectContaining({
        key: 'items',
        min: 2,
        max: 4,
        fields: [expect.objectContaining({ key: 'label' })],
      }),
    ]);
  });

  it('writes the headings, the buttons, or everything, as the action asks', () => {
    const hero = setAtPath(section('hero', 'split'), 'content.secondaryCta.label', 'Xem bảng giá');
    expect(aiActionPaths(hero, 'suggest_heading')).toEqual(['heading']);
    expect(aiActionPaths(hero, 'suggest_cta')).toEqual(['primaryCta.label', 'secondaryCta.label']);
    expect(aiActionPaths(hero, 'rewrite')).toEqual(aiWritablePaths(hero));
    expect(aiActionPaths(hero, 'suggest_seo')).toEqual([]);
    // A form's submit label is a button too.
    expect(aiActionPaths(section('lead_form'), 'suggest_cta')).toEqual(['submitLabel']);
    // The navigation bar has no heading of its own.
    expect(aiActionPaths(section('navbar'), 'suggest_heading')).toEqual([]);
  });
});
