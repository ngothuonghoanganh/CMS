import { Module } from '@nestjs/common';
import { WorkspaceCollectionsModule } from '../../shared/persistence/workspace-databases.js';
import { AssetsModule } from '../assets/assets.module.js';
import { TemplateAssets } from './template-assets.js';
import { TemplateMaterializer } from './template-materializer.js';
import { TEMPLATE_COLLECTION, TEMPLATE_VERSION_COLLECTION } from './template.schema.js';
import { TemplateVersionsRepository } from './template-versions.repository.js';
import { TemplatesRepository } from './templates.repository.js';

/**
 * Workspace templates without HTTP (ADR-030): their collections, their images, and the making of
 * a template into a site's content. The pages module makes pages and drafts from templates with it,
 * and the templates module, which counts the pages made from them, lists and saves them: one module
 * holding both would make a cycle.
 */
@Module({
  imports: [
    WorkspaceCollectionsModule.forFeature([TEMPLATE_COLLECTION, TEMPLATE_VERSION_COLLECTION]),
    AssetsModule,
  ],
  providers: [
    TemplatesRepository,
    TemplateVersionsRepository,
    TemplateAssets,
    TemplateMaterializer,
  ],
  exports: [TemplatesRepository, TemplateVersionsRepository, TemplateAssets, TemplateMaterializer],
})
export class TemplatesCoreModule {}
