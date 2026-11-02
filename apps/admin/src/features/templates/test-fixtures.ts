import type {
  TemplateDetail,
  TemplateSiteReadiness,
  TemplateSummary,
  TemplateVersionItem,
  WorkspaceTemplate,
} from '@plp/contracts';
import {
  buildCompositionFromTemplate,
  findSystemTemplate,
  type SystemTemplate,
  systemTemplates,
  templateHasForm,
  templateSections,
} from '@plp/sections/schema';

export const WORKSPACE_TEMPLATE_ID = '64b0000000000000000000f1';

/** A workspace template of board 19: "Tư vấn niềng răng trả góp", at v2, for every site. */
export function workspaceTemplateFixture(
  overrides: Partial<WorkspaceTemplate> = {},
): WorkspaceTemplate {
  const template = findSystemTemplate('nha-khoa-uu-dai');
  if (!template) {
    throw new Error('No system template "nha-khoa-uu-dai"');
  }
  return {
    id: WORKSPACE_TEMPLATE_ID,
    name: 'Tư vấn niềng răng trả góp',
    description: 'Bản đã dùng cho Smile Care, gồm bảng so sánh mắc cài.',
    goal: 'lead',
    industry: 'dental_health',
    scope: { kind: 'workspace' },
    currentVersion: 2,
    archived: false,
    usedCount: 3,
    hasForm: true,
    sections: templateSections(template),
    createdBy: { id: '64b0000000000000000000c1', name: 'Quốc Bảo' },
    updatedAt: '2026-10-12T03:00:00.000Z',
    updatedBy: { id: '64b0000000000000000000c2', name: 'Ngọc Anh' },
    ...overrides,
  };
}

/** The library card of a workspace template. */
export function workspaceSummaryFixture(overrides: Partial<TemplateSummary> = {}): TemplateSummary {
  const template = workspaceTemplateFixture();
  return {
    id: template.id,
    source: 'workspace',
    version: template.currentVersion,
    updatedAt: template.updatedAt,
    name: template.name,
    description: template.description,
    goal: template.goal,
    industry: template.industry,
    hasForm: template.hasForm,
    sections: template.sections,
    siteIds: null,
    ...overrides,
  };
}

/** "Lịch sử phiên bản" of the workspace template: v2 in use, v1 saved from a page. */
export const versionFixtures: readonly TemplateVersionItem[] = [
  {
    version: 2,
    note: 'Thêm bảng so sánh mắc cài',
    source: { pageId: '64b0000000000000000000d1', pageTitle: 'Niềng răng tháng 10', kind: 'live' },
    reusedFrom: null,
    createdBy: { id: '64b0000000000000000000c2', name: 'Ngọc Anh' },
    createdAt: '2026-10-12T03:00:00.000Z',
    usedCount: 2,
  },
  {
    version: 1,
    note: '',
    source: { pageId: '64b0000000000000000000d2', pageTitle: 'Niềng răng tháng 9', kind: 'draft' },
    reusedFrom: null,
    createdBy: { id: '64b0000000000000000000c1', name: 'Quốc Bảo' },
    createdAt: '2026-09-02T03:00:00.000Z',
    usedCount: 1,
  },
];

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
    siteIds: null,
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
    currentVersion: template.version,
    archived: false,
    composition: buildCompositionFromTemplate(template, () => {
      next += 1;
      return `preview${String(next).padStart(5, '0')}`;
    }),
    images: {},
    usedCount: 3,
    site: readinessFixture(),
    ...overrides,
  };
}
