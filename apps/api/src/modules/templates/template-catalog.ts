import type { Composition, TemplateRef, TemplateSource, TemplateSummary } from '@plp/contracts';
import {
  buildCompositionFromTemplate,
  findSystemTemplate,
  parseComposition,
  type SystemTemplate,
  systemTemplates,
  templateHasForm,
  templateSections,
} from '@plp/sections/schema';
import { AppError, notFound } from '../../shared/errors.js';

export const TEMPLATE_NOT_FOUND = 'Không tìm thấy mẫu';

/** The system template with this id; an unknown one is 404, like any resource (ADR-030). */
export function systemTemplateOrNotFound(id: string): SystemTemplate {
  const template = findSystemTemplate(id);
  if (!template) {
    throw notFound(TEMPLATE_NOT_FOUND);
  }
  return template;
}

/**
 * 409 for a version that is no longer the template's current one. A newer version is refused
 * rather than made unseen: the admin shows the new one, then the user tries again.
 */
export function templateChanged(name: string, currentVersion: number): AppError {
  return new AppError(
    409,
    'template_changed',
    `Mẫu “${name}” đã có phiên bản mới (v${currentVersion})`,
    {
      detail: 'Xem lại bản xem trước của phiên bản mới rồi thử lại.',
      context: { currentVersion },
    },
  );
}

/** The system template a page is created from, at the version the user previewed. */
export function systemTemplateForRef(
  ref: Pick<TemplateRef, 'templateId' | 'version'>,
): SystemTemplate {
  const template = systemTemplateOrNotFound(ref.templateId);
  if (template.version !== ref.version) {
    throw templateChanged(template.name, template.version);
  }
  return template;
}

/**
 * The template's composition as the registry parsed it, with section ids from `newId`. Every
 * template is parsed by its unit test, so a failure here is a bug, not a user error.
 */
export function templateComposition(template: SystemTemplate, newId: () => string): Composition {
  const parsed = parseComposition(buildCompositionFromTemplate(template, newId));
  if (!parsed.success) {
    throw new Error(
      `The "${template.id}" template v${template.version} produced an invalid composition: ${JSON.stringify(parsed.issues)}`,
    );
  }
  return parsed.composition;
}

/** Section ids of a preview: the same on every request, valid for `sectionIdSchema`. */
export function previewSectionIds(): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `preview${String(next).padStart(5, '0')}`;
  };
}

/** Midnight UTC of the day the version was written. */
function updatedAtOf(template: SystemTemplate): string {
  return new Date(`${template.updatedOn}T00:00:00.000Z`).toISOString();
}

const SYSTEM: TemplateSource = 'system';

export function toTemplateSummary(template: SystemTemplate): TemplateSummary {
  return {
    id: template.id,
    source: SYSTEM,
    version: template.version,
    updatedAt: updatedAtOf(template),
    name: template.name,
    description: template.description,
    goal: template.goal,
    industry: template.industry,
    hasForm: templateHasForm(template),
    sections: templateSections(template),
    // A system template may be used in every site.
    siteIds: null,
  };
}

/** The library: the system templates in the catalog's order. */
export function systemTemplateSummaries(): TemplateSummary[] {
  return systemTemplates.map(toTemplateSummary);
}
