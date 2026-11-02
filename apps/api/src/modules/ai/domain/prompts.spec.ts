import type { AiBrief } from '@plp/contracts';
import { createSectionInstance, setAtPath } from '@plp/sections/schema';
import { describe, expect, it } from 'vitest';
import { buildSectionPrompt, type PromptContext, withRetryFeedback } from './prompts.js';
import { copyPlanOf } from './section-copy.js';

const BRIEF: AiBrief = {
  product: 'Niềng răng trong suốt Invisalign, trả góp 0% trong 12 tháng',
  audience: 'Người đi làm 22–35 tuổi ở TP.HCM, ngại mắc cài kim loại',
  goal: 'lead',
  differentiators: 'Bác sĩ 12 năm kinh nghiệm chỉnh nha. Chụp phim 3D miễn phí.',
  tone: 'friendly',
  language: 'vi',
  existingContent: '',
};

const CONTEXT: PromptContext = {
  siteName: 'Nha khoa Smile Care',
  brief: BRIEF,
  outline: ['Thanh điều hướng', 'Hero', 'Lợi ích', 'Chân trang'],
};

describe('the prompt of a section (ADR-031)', () => {
  it('holds the brief, the site name, the outline and what to write', () => {
    const benefits = createSectionInstance('benefits', 'grid', 'abcdefgh1234');
    const { system, prompt } = buildSectionPrompt(CONTEXT, benefits, copyPlanOf(benefits));
    expect(system).toContain('Write in Vietnamese, with full diacritics');
    expect(system).toContain('warm and friendly');
    expect(system).toContain('Never write phone numbers, addresses, email addresses');
    expect(prompt.split('\n')).toEqual(
      expect.arrayContaining([
        'Site: Nha khoa Smile Care',
        'Page goal: Thu lead tư vấn (Khách để lại tên và số điện thoại để được gọi lại.)',
        `- Product or service: ${BRIEF.product}`,
        `- Target customers: ${BRIEF.audience}`,
        `- Key message and differentiators: ${BRIEF.differentiators}`,
        '- Content the business already has: (none)',
        'Page sections, in order: 1. Thanh điều hướng, 2. Hero, 3. Lợi ích, 4. Chân trang',
        'Section type: benefits',
        '- heading: Tiêu đề, required, at most 80 characters',
        '- items: 3 to 6 items "Lợi ích", each with:',
        '  - title: Tiêu đề, required, at most 60 characters',
      ]),
    );
  });

  it('carries nothing of the page beyond its text: no link, image, or phone number', () => {
    let hero = createSectionInstance('hero', 'split', 'abcdefgh1234');
    hero = setAtPath(hero, 'content.primaryCta.link', { kind: 'phone', phone: '0901 234 567' });
    hero = setAtPath(hero, 'content.image', {
      assetId: '64b000000000000000000001',
      alt: 'Bác sĩ Trần Minh',
      decorative: false,
    });
    const { system, prompt } = buildSectionPrompt(
      { ...CONTEXT, brief: { ...BRIEF, existingContent: 'Bảng giá: niềng 2 hàm 45 triệu' } },
      hero,
      copyPlanOf(hero),
    );
    const sent = `${system}\n${prompt}`;
    expect(sent).toContain('- Content the business already has: Bảng giá: niềng 2 hàm 45 triệu');
    for (const absent of ['0901 234 567', 'Bác sĩ Trần Minh', '64b000000000000000000001', '@']) {
      expect(sent).not.toContain(absent);
    }
  });

  it('writes English when asked, in the tone asked', () => {
    const hero = createSectionInstance('hero', 'split', 'abcdefgh1234');
    const { system } = buildSectionPrompt(
      { ...CONTEXT, brief: { ...BRIEF, language: 'en', tone: 'professional' } },
      hero,
      copyPlanOf(hero),
    );
    expect(system).toContain('Write in English. Tone: clear, professional and trustworthy.');
  });

  it('retries with what was wrong, never with the refused answer', () => {
    const hero = createSectionInstance('hero', 'split', 'abcdefgh1234');
    const first = buildSectionPrompt(CONTEXT, hero, copyPlanOf(hero));
    const retry = withRetryFeedback(first, [
      { path: 'heading', message: 'is longer than 80 characters' },
      { path: '', message: 'is not valid JSON' },
    ]);
    expect(retry.system).toBe(first.system);
    expect(retry.prompt.startsWith(first.prompt)).toBe(true);
    expect(retry.prompt).toContain('- heading is longer than 80 characters');
    expect(retry.prompt).toContain('- the answer is not valid JSON');
  });
});
