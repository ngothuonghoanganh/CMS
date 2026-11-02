import { describe, expect, it } from 'vitest';
import { idSchema } from './common.js';
import { createPageRequestSchema } from './page.js';
import {
  systemTemplateIdSchema,
  templateDetailQuerySchema,
  templateIndustries,
  templateIndustryLabels,
} from './templates.js';

describe('system template ids', () => {
  it('are kebab-case with at least one hyphen', () => {
    expect(systemTemplateIdSchema.parse('nha-khoa-uu-dai')).toBe('nha-khoa-uu-dai');
    for (const id of ['nhakhoa', 'Nha-khoa', 'nha_khoa-uu-dai', '-nha-khoa', 'nha--khoa', '']) {
      expect(systemTemplateIdSchema.safeParse(id).success, id).toBe(false);
    }
  });

  it('never read as an ObjectId, so one path segment names either kind of template', () => {
    const objectId = '64b000000000000000000001';
    expect(idSchema.safeParse(objectId).success).toBe(true);
    expect(systemTemplateIdSchema.safeParse(objectId).success).toBe(false);
  });
});

describe('industries', () => {
  it('are the six of the filter of board 17', () => {
    expect(templateIndustries.map((industry) => templateIndustryLabels[industry])).toEqual([
      'Nha khoa & y tế',
      'Spa & làm đẹp',
      'Giáo dục',
      'Bất động sản',
      'Nhà hàng & F&B',
      'Thể hình',
    ]);
  });
});

describe('creating a page from a template', () => {
  const body = { title: 'Ưu đãi tẩy trắng răng', slug: 'uu-dai' };

  it('names the source, the template and the version that was previewed', () => {
    const start = { kind: 'template', source: 'system', templateId: 'nha-khoa-uu-dai', version: 2 };
    expect(createPageRequestSchema.parse({ ...body, start }).start).toEqual(start);
  });

  it('refuses a version that is not a positive whole number, or another source for now', () => {
    for (const start of [
      { kind: 'template', source: 'system', templateId: 'nha-khoa-uu-dai', version: 0 },
      { kind: 'template', source: 'system', templateId: 'nha-khoa-uu-dai', version: 1.5 },
      { kind: 'template', source: 'system', templateId: 'nha-khoa-uu-dai' },
      { kind: 'template', source: 'workspace', templateId: 'nha-khoa-uu-dai', version: 1 },
      { kind: 'template', source: 'system', templateId: 'NHA KHOA', version: 1 },
    ]) {
      expect(createPageRequestSchema.safeParse({ ...body, start }).success).toBe(false);
    }
  });
});

describe('templateDetailQuerySchema', () => {
  it('takes an optional site id', () => {
    expect(templateDetailQuerySchema.parse({})).toEqual({});
    expect(templateDetailQuerySchema.parse({ siteId: '64b000000000000000000001' })).toEqual({
      siteId: '64b000000000000000000001',
    });
    expect(templateDetailQuerySchema.safeParse({ siteId: 'smile' }).success).toBe(false);
  });
});
