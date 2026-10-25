import { sectionIdSchema } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { newSectionId } from './section-id.js';

describe('newSectionId', () => {
  it('returns 12 lowercase alphanumerics accepted by the section id schema', () => {
    const ids = Array.from({ length: 200 }, () => newSectionId());
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]{12}$/);
      expect(sectionIdSchema.safeParse(id).success).toBe(true);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});
