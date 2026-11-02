import type { TemplateDetail, TemplateSiteReadiness, TemplateSummary } from '@plp/contracts';
import {
  buildCompositionFromTemplate,
  findSystemTemplate,
  type SystemTemplate,
  systemTemplates,
  templateHasForm,
  templateSections,
} from '@plp/sections/schema';

// Shared by the specs of the template library: the real catalog, as the API serves it.

function summaryOf(template: SystemTemplate): TemplateSummary {
  return {
    id: template.id,
    source: 'system',
    version: template.version,
    updatedAt: `${template.updatedOn}T00:00:00.000Z`,
    name: template.name,
    description: template.description,
    goal: template.goal,
    industry: template.industry,
    hasForm: templateHasForm(template),
    sections: templateSections(template),
  };
}

export const templateSummaries: readonly TemplateSummary[] = systemTemplates.map(summaryOf);

export function summaryFixture(id = 'nha-khoa-uu-dai'): TemplateSummary {
  const template = findSystemTemplate(id);
  if (!template) {
    throw new Error(`No system template "${id}"`);
  }
  return summaryOf(template);
}

export function readinessFixture(
  overrides: Partial<TemplateSiteReadiness> = {},
): TemplateSiteReadiness {
  return {
    siteId: '64b000000000000000000001',
    confirmedRecipients: 1,
    recipientEmail: 'ngocanh@mayxanh.vn',
    consentVersion: 3,
    consentGaps: [],
    ...overrides,
  };
}

export function detailFixture(
  id = 'nha-khoa-uu-dai',
  overrides: Partial<TemplateDetail> = {},
): TemplateDetail {
  const template = findSystemTemplate(id);
  if (!template) {
    throw new Error(`No system template "${id}"`);
  }
  let next = 0;
  return {
    ...summaryOf(template),
    details: template.details,
    composition: buildCompositionFromTemplate(template, () => {
      next += 1;
      return `preview${String(next).padStart(5, '0')}`;
    }),
    usedCount: 3,
    site: readinessFixture(),
    ...overrides,
  };
}
