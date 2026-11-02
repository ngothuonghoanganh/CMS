import {
  compositionSchema,
  pageGoalIds,
  type SectionInstance,
  systemTemplateIdSchema,
  templateIndustries,
} from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { pageStyleSchemes } from './blueprints.js';
import { getAtPath } from './paths.js';
import {
  collectLeaves,
  getSectionDefinition,
  getVariant,
  parseComposition,
  samplePathsOf,
  validateComposition,
} from './registry.js';
import {
  buildCompositionFromTemplate,
  findSystemTemplate,
  systemTemplates,
  templateHasForm,
  templateSections,
} from './templates.js';

function idGenerator(prefix = 'tpl'): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `${prefix}${String(next).padStart(8, '0')}`;
  };
}

function templateOf(id: string) {
  const template = findSystemTemplate(id);
  if (!template) {
    throw new Error(`No system template "${id}"`);
  }
  return template;
}

function build(id: string) {
  return buildCompositionFromTemplate(templateOf(id), idGenerator());
}

function only(sections: readonly SectionInstance[], type: SectionInstance['type']) {
  const matches = sections.filter((section) => section.type === type);
  const first = matches[0];
  if (matches.length !== 1 || !first) {
    throw new Error(`Expected exactly one "${type}" section, found ${matches.length}`);
  }
  return first;
}

const ids = systemTemplates.map((template) => template.id);

describe('the system catalog', () => {
  it('has 12 templates with stable, unique ids and names', () => {
    expect(systemTemplates).toHaveLength(12);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(systemTemplates.map((template) => template.name)).size).toBe(ids.length);
    for (const template of systemTemplates) {
      expect(systemTemplateIdSchema.safeParse(template.id).success, template.id).toBe(true);
      expect(Number.isInteger(template.version) && template.version > 0).toBe(true);
      expect(template.updatedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(template.updatedOn))).toBe(false);
      for (const text of [template.name, template.description, template.details]) {
        expect(text.trim()).not.toBe('');
      }
    }
  });

  it('covers every goal, and every industry of board 17 twice', () => {
    expect(new Set(systemTemplates.map((template) => template.goal))).toEqual(new Set(pageGoalIds));
    for (const industry of templateIndustries) {
      expect(
        systemTemplates.filter((template) => template.industry === industry),
        industry,
      ).toHaveLength(2);
    }
  });

  it('finds a template by its id only', () => {
    expect(findSystemTemplate('nha-khoa-uu-dai')?.name).toBe('Ưu đãi dịch vụ nha khoa');
    expect(findSystemTemplate('khong-co-mau')).toBeUndefined();
    expect(findSystemTemplate('')).toBeUndefined();
  });
});

describe.each(ids)('template "%s"', (id) => {
  it('parses with the registry exactly as built, with only its section types and variants', () => {
    const composition = build(id);
    expect(compositionSchema.safeParse(composition).success).toBe(true);
    expect(validateComposition(composition)).toEqual([]);
    const parsed = parseComposition(composition);
    expect(parsed.success).toBe(true);
    // Nothing the schemas do not know: the stored draft is the template as written.
    expect(parsed.success ? parsed.composition : null).toEqual(composition);
    for (const section of composition.sections) {
      expect(getVariant(getSectionDefinition(section.type), section.variant)).toBeDefined();
    }
  });

  it('opens with the navigation bar, ends with the footer and gives each section a fresh id', () => {
    const composition = build(id);
    expect(composition.sections[0]?.type).toBe('navbar');
    expect(composition.sections.at(-1)?.type).toBe('footer');
    const sectionIds = composition.sections.map((section) => section.id);
    expect(new Set(sectionIds).size).toBe(sectionIds.length);
    expect(sectionIds[0]).toBe('tpl00000001');
    // Another draft from the same template gets other ids.
    const again = buildCompositionFromTemplate(templateOf(id), idGenerator('new'));
    expect(again.sections.map((section) => section.id)).not.toEqual(sectionIds);
  });

  it('marks every text as sample text, the hidden fields of its variants included', () => {
    for (const section of build(id).sections) {
      expect(section.samplePaths).toEqual(samplePathsOf(section));
      for (const leaf of collectLeaves(section, { includeHidden: true })) {
        if (leaf.field.kind === 'text' && typeof leaf.value === 'string' && leaf.value !== '') {
          expect(section.samplePaths, `${section.type} ${leaf.path}`).toContain(leaf.path);
        }
        if (leaf.field.kind === 'cta' && getAtPath(leaf.value, 'label') !== '') {
          expect(section.samplePaths, `${section.type} ${leaf.path}`).toContain(
            `${leaf.path}.label`,
          );
        }
      }
    }
  });

  it('has no image: every frame waits for the site’s own photos', () => {
    for (const section of build(id).sections) {
      for (const leaf of collectLeaves(section, { includeHidden: true })) {
        if (leaf.field.kind === 'image') {
          expect(getAtPath(leaf.value, 'assetId'), `${section.type} ${leaf.path}`).toBeNull();
        }
      }
    }
  });

  it('colors its sections with its style, and lists them as the outline and thumbnail', () => {
    const template = templateOf(id);
    const composition = build(id);
    const outline = templateSections(template);
    expect(
      outline.map(({ type, variant, colorScheme }) => ({ type, variant, colorScheme })),
    ).toEqual(
      composition.sections.map(({ type, variant, colorScheme }) => ({
        type,
        variant,
        colorScheme,
      })),
    );
    expect(composition.sections.map((section) => section.colorScheme)).toEqual(
      pageStyleSchemes(
        template.style,
        composition.sections.map((section) => section.type),
      ),
    );
    for (const item of outline) {
      expect(item.label.trim()).not.toBe('');
    }
  });

  it('leads its buttons to the form, or else to the call and Zalo buttons', () => {
    const { sections } = build(id);
    const hasForm = sections.some((section) => section.type === 'lead_form');
    expect(templateHasForm(templateOf(id))).toBe(hasForm);
    const target = only(sections, hasForm ? 'lead_form' : 'quick_contact');
    const link = { kind: 'section', sectionId: target.id };
    expect(getAtPath(only(sections, 'hero').content, 'primaryCta.link')).toEqual(link);
    expect(getAtPath(only(sections, 'navbar').content, 'cta.link')).toEqual(link);
  });
});

describe('the board’s template', () => {
  it('“Ưu đãi dịch vụ nha khoa” follows board 18: offer, doctors, reviews, FAQ, form', () => {
    const template = templateOf('nha-khoa-uu-dai');
    expect(templateSections(template).map((section) => section.label)).toEqual([
      'Thanh điều hướng · nút đặt lịch',
      'Hero · ưu đãi và nút đặt lịch',
      'Lợi ích · 3 lý do chọn phòng khám',
      'Giới thiệu bác sĩ',
      'Cảm nhận khách hàng',
      'Câu hỏi thường gặp',
      'Form đăng ký tư vấn',
      'Chân trang · địa chỉ, giờ mở cửa',
    ]);
    expect(template.goal).toBe('lead');
    expect(template.industry).toBe('dental_health');
  });
});
