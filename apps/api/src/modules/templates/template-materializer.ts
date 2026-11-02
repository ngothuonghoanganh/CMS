import { Injectable } from '@nestjs/common';
import type { Composition, PageGoal, TemplateRef } from '@plp/contracts';
import { parseComposition, withFreshSectionIds } from '@plp/sections/schema';
import { AppError, notFound } from '../../shared/errors.js';
import { type ObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { AssetRecord } from '../assets/asset.schema.js';
import type { CreateAssetInput } from '../assets/assets.repository.js';
import type { PageCreatedFromRecord } from '../pages/page.schema.js';
import { newSectionId } from '../pages/section-id.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { templateUsableIn } from './domain/template-scope.js';
import { TemplateAssets } from './template-assets.js';
import {
  systemTemplateForRef,
  TEMPLATE_NOT_FOUND,
  templateChanged,
  templateComposition,
} from './template-catalog.js';
import { TemplateVersionsRepository } from './template-versions.repository.js';
import { TemplatesRepository } from './templates.repository.js';

/** A template made ready for one site: what a new page or a draft takes from it. */
export interface MaterializedTemplate {
  /** The template's name and version then, for the activity. */
  name: string;
  version: number;
  goal: PageGoal | null;
  createdFrom: PageCreatedFromRecord;
  /** Fresh section ids, parsed by the registry, naming only the site's own assets. */
  composition: Composition;
  /** The images copied into the site, to insert with the page's write; none for a system one. */
  assets: CreateAssetInput[];
}

/**
 * Makes a template of the library into a site's content (ADR-030): a new page, a draft that takes
 * it (board 18) or the editor's "Áp dụng mẫu…". It checks the template the member asked for, at the
 * version they previewed, then copies its images into the site.
 */
@Injectable()
export class TemplateMaterializer {
  constructor(
    private readonly templates: TemplatesRepository,
    private readonly versions: TemplateVersionsRepository,
    private readonly assets: TemplateAssets,
  ) {}

  /**
   * The template for the site. A system template is in code; a workspace template must be one the
   * member sees and the site may use (404 otherwise, as any resource), not archived (409
   * `template_archived`), at the version given (409 `template_changed`). The site's access was
   * checked by the caller. The images are copied now: `insert` records them in the caller's
   * transaction, and `discard` deletes them when it fails.
   */
  async materialize(
    scope: WorkspaceScope,
    siteId: ObjectId,
    ref: TemplateRef,
  ): Promise<MaterializedTemplate> {
    if (ref.source === 'system') {
      // Fresh section ids for every page: two pages from one template never share one.
      const template = systemTemplateForRef(ref);
      return {
        name: template.name,
        version: template.version,
        goal: template.goal,
        createdFrom: {
          kind: 'template',
          source: 'system',
          templateId: template.id,
          version: template.version,
        },
        composition: templateComposition(template, newSectionId),
        assets: [],
      };
    }
    const id = toObjectId(ref.templateId, TEMPLATE_NOT_FOUND);
    const template = await this.templates.findVisible(scope, id);
    if (template === null || !templateUsableIn(template.scope, siteId)) {
      throw notFound(TEMPLATE_NOT_FOUND);
    }
    if (template.archivedAt !== null) {
      throw new AppError(409, 'template_archived', `Mẫu “${template.name}” đã được lưu trữ`, {
        detail: 'Khôi phục mẫu ở “Template của workspace” để dùng lại.',
      });
    }
    if (template.currentVersion !== ref.version) {
      throw templateChanged(template.name, template.currentVersion);
    }
    const version = await this.versions.find(scope, id, ref.version);
    if (version === null) {
      throw new Error(
        `Template ${id.toHexString()} has no version ${ref.version}, its current one`,
      );
    }
    const images = await this.assets.toSite(scope, siteId, version.composition, version.assets);
    const parsed = parseComposition(withFreshSectionIds(images.composition, newSectionId));
    if (!parsed.success) {
      await this.assets.discard(
        images.assets.map((asset) => asset.storageKey),
        siteId,
      );
      throw new Error(
        `Template ${id.toHexString()} v${ref.version} no longer parses: ${JSON.stringify(parsed.issues)}`,
      );
    }
    return {
      name: template.name,
      version: template.currentVersion,
      goal: template.goal,
      createdFrom: {
        kind: 'template',
        source: 'workspace',
        templateId: id.toHexString(),
        version: template.currentVersion,
      },
      composition: parsed.composition,
      assets: images.assets,
    };
  }

  /** Records the copied images as the site's assets, in the transaction that writes the page. */
  insertImages(
    scope: WorkspaceScope,
    template: MaterializedTemplate,
    tx: Tx,
  ): Promise<AssetRecord[]> {
    return this.assets.insert(scope, template.assets, tx);
  }

  /** Deletes the copied images after the page's write failed; a failure is only logged. */
  discardImages(template: MaterializedTemplate, siteId: ObjectId): Promise<void> {
    return this.assets.discard(
      template.assets.map((asset) => asset.storageKey),
      siteId,
    );
  }
}
