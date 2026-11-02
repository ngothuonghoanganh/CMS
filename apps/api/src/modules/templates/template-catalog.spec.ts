import { compositionSchema, sectionIdSchema, templateSummarySchema } from '@plp/contracts';
import { systemTemplates } from '@plp/sections/schema';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../shared/errors.js';
import {
  previewSectionIds,
  systemTemplateOrNotFound,
  systemTemplateSummaries,
  templateComposition,
  templateForStart,
  toTemplateSummary,
} from './template-catalog.js';

function errorOf(run: () => unknown): AppError {
  try {
    run();
  } catch (error) {
    if (error instanceof AppError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected an AppError');
}

const start = { kind: 'template', source: 'system', templateId: 'nha-khoa-uu-dai' } as const;

describe('the system catalog as the API serves it', () => {
  it('lists every system template, in the catalog’s order, as library cards', () => {
    const items = systemTemplateSummaries();
    expect(items.map((item) => item.id)).toEqual(systemTemplates.map((template) => template.id));
    for (const item of items) {
      expect(templateSummarySchema.parse(item)).toEqual(item);
      expect(item.source).toBe('system');
    }
  });

  it('says a template has a form, and dates its version at midnight UTC of its day', () => {
    const summary = toTemplateSummary(systemTemplateOrNotFound('nha-khoa-uu-dai'));
    expect(summary).toMatchObject({
      name: 'Ưu đãi dịch vụ nha khoa',
      goal: 'lead',
      industry: 'dental_health',
      hasForm: true,
      updatedAt: '2026-11-02T00:00:00.000Z',
    });
    expect(summary.sections).toHaveLength(8);
    expect(toTemplateSummary(systemTemplateOrNotFound('nha-hang-thuc-don')).hasForm).toBe(false);
  });

  it('answers 404 for an unknown template', () => {
    expect(errorOf(() => systemTemplateOrNotFound('khong-co-mau'))).toMatchObject({
      status: 404,
      code: 'not_found',
      title: 'Không tìm thấy mẫu',
    });
  });
});

describe('templateForStart', () => {
  it('returns the template at the version the user previewed', () => {
    const template = templateForStart({ ...start, version: 1 });
    expect(template.id).toBe('nha-khoa-uu-dai');
  });

  it('refuses any other version with the current one, rather than make it unseen', () => {
    for (const version of [2, 99]) {
      expect(errorOf(() => templateForStart({ ...start, version }))).toMatchObject({
        status: 409,
        code: 'template_changed',
        title: 'Mẫu “Ưu đãi dịch vụ nha khoa” đã có phiên bản mới (v1)',
        context: { currentVersion: 1 },
      });
    }
  });

  it('answers 404 for an unknown template, before its version', () => {
    expect(
      errorOf(() => templateForStart({ ...start, templateId: 'khong-co-mau', version: 1 })).status,
    ).toBe(404);
  });
});

describe('templateComposition', () => {
  it('builds the parsed composition with the section ids it is given', () => {
    const composition = templateComposition(
      systemTemplateOrNotFound('spa-dat-lich'),
      previewSectionIds(),
    );
    expect(compositionSchema.parse(composition)).toEqual(composition);
    expect(composition.sections.map((section) => section.id)).toEqual(
      composition.sections.map((_section, index) => `preview${String(index + 1).padStart(5, '0')}`),
    );
    for (const section of composition.sections) {
      expect(sectionIdSchema.safeParse(section.id).success).toBe(true);
    }
  });
});
