import { createSectionInstance } from '@plp/sections/schema';
import { describe, expect, it } from 'vitest';
import { sampleNote } from './field-shared';

describe('sampleNote', () => {
  it('marks sample text, and text the AI wrote to check (ADR-031)', () => {
    const hero = {
      ...createSectionInstance('hero', 'split', 'hero00000001'),
      samplePaths: ['heading'],
      reviewPaths: ['subheading'],
    };
    expect(sampleNote(hero, 'heading')).toBe('nội dung mẫu');
    expect(sampleNote(hero, 'subheading')).toBe('AI viết · cần kiểm tra');
    expect(sampleNote(hero, 'eyebrow')).toBeUndefined();
  });
});
