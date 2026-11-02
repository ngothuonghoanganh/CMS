import { describe, expect, it } from 'vitest';
import { idSchema } from './common.js';
import { createPageRequestSchema } from './page.js';
import {
  createWorkspaceTemplateRequestSchema,
  isWorkspaceTemplateId,
  systemTemplateIdSchema,
  templateDetailQuerySchema,
  templateIndustries,
  templateIndustryLabels,
  templateScopeSchema,
  templateUsableIn,
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

  it('names a workspace template by its ObjectId', () => {
    const start = {
      kind: 'template',
      source: 'workspace',
      templateId: '64b000000000000000000001',
      version: 3,
    };
    expect(createPageRequestSchema.parse({ ...body, start }).start).toEqual(start);
  });

  it('refuses a version that is not a positive whole number, or an id of the other source', () => {
    for (const start of [
      { kind: 'template', source: 'system', templateId: 'nha-khoa-uu-dai', version: 0 },
      { kind: 'template', source: 'system', templateId: 'nha-khoa-uu-dai', version: 1.5 },
      { kind: 'template', source: 'system', templateId: 'nha-khoa-uu-dai' },
      { kind: 'template', source: 'workspace', templateId: 'nha-khoa-uu-dai', version: 1 },
      { kind: 'template', source: 'system', templateId: '64b000000000000000000001', version: 1 },
      { kind: 'template', source: 'marketplace', templateId: 'nha-khoa-uu-dai', version: 1 },
      { kind: 'template', source: 'system', templateId: 'NHA KHOA', version: 1 },
    ]) {
      expect(createPageRequestSchema.safeParse({ ...body, start }).success).toBe(false);
    }
  });
});

describe('workspace templates', () => {
  it('tell a workspace template id from a system one', () => {
    expect(isWorkspaceTemplateId('64b000000000000000000001')).toBe(true);
    expect(isWorkspaceTemplateId('nha-khoa-uu-dai')).toBe(false);
  });

  it('are usable in every site, or only in the sites chosen', () => {
    expect(templateUsableIn(null, '64b000000000000000000001')).toBe(true);
    expect(templateUsableIn(['64b000000000000000000001'], '64b000000000000000000001')).toBe(true);
    expect(templateUsableIn(['64b000000000000000000001'], '64b000000000000000000002')).toBe(false);
    expect(templateUsableIn([], '64b000000000000000000001')).toBe(false);
  });

  it('are limited to at least one site, each once', () => {
    const site = '64b000000000000000000001';
    expect(templateScopeSchema.safeParse({ kind: 'sites', siteIds: [site] }).success).toBe(true);
    expect(templateScopeSchema.safeParse({ kind: 'sites', siteIds: [] }).success).toBe(false);
    expect(templateScopeSchema.safeParse({ kind: 'sites', siteIds: [site, site] }).success).toBe(
      false,
    );
  });

  it('are saved with a name and a note within their limits', () => {
    const request = {
      source: { siteId: '64b000000000000000000001', pageId: '64b000000000000000000002' },
      content: 'keep',
      note: '  Thêm FAQ về trả góp  ',
      name: ' Tư vấn niềng răng trả góp ',
      description: '',
      goal: null,
      industry: 'dental_health',
      scope: { kind: 'workspace' },
    };
    const live = { ...request, source: { ...request.source, kind: 'live' } };
    expect(createWorkspaceTemplateRequestSchema.parse(live)).toMatchObject({
      name: 'Tư vấn niềng răng trả góp',
      note: 'Thêm FAQ về trả góp',
    });
    expect(createWorkspaceTemplateRequestSchema.safeParse(request).success).toBe(false);
    expect(createWorkspaceTemplateRequestSchema.safeParse({ ...live, name: ' ' }).success).toBe(
      false,
    );
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

  it('takes an optional version from the query string', () => {
    expect(templateDetailQuerySchema.parse({ version: '2' })).toEqual({ version: 2 });
    expect(templateDetailQuerySchema.safeParse({ version: '0' }).success).toBe(false);
  });
});
