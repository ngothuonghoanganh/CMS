import { Injectable } from '@nestjs/common';
import {
  type Composition,
  type createTemplateVersionRequestSchema,
  type createWorkspaceTemplateRequestSchema,
  MAX_TEMPLATE_VERSIONS,
  MAX_WORKSPACE_TEMPLATES,
  type ReuseTemplateVersionRequest,
  type TemplateScope,
  type TemplateSourcePage,
  type TemplateVersionListResponse,
  type updateWorkspaceTemplateRequestSchema,
  type UserRef,
  type WorkspaceTemplate,
  type WorkspaceTemplateListResponse,
} from '@plp/contracts';
import { compositionHasForm, compositionOutline, parseComposition } from '@plp/sections/schema';
import type { z } from 'zod';
import { AppError, notFound, validationFailed } from '../../shared/errors.js';
import { newObjectId, type ObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import { type Tx, TransactionRunner } from '../../shared/persistence/transaction.js';
import { ActivityRepository } from '../activity/activity.repository.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { UsersRepository } from '../auth/users.repository.js';
import { PAGE_NOT_FOUND } from '../pages/page-access.service.js';
import type { PageRecord } from '../pages/page.schema.js';
import { PagesRepository } from '../pages/pages.repository.js';
import { ReleasesRepository } from '../publishing/releases.repository.js';
import type { SiteRecord } from '../sites/site.schema.js';
import { SitesRepository } from '../sites/sites.repository.js';
import { SITE_NOT_FOUND } from '../sites/sites.service.js';
import { AccessService } from '../workspaces/access.service.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { WorkspacesRepository } from '../workspaces/workspaces.repository.js';
import { templateContentOf } from './domain/template-content.js';
import {
  scopeAfterChange,
  type ScopeChange,
  scopeDto,
  type TemplateScopeRecord,
  templateVisibleTo,
} from './domain/template-scope.js';
import { TemplateAssets, type TemplateImages } from './template-assets.js';
import { TEMPLATE_NOT_FOUND, templateChanged } from './template-catalog.js';
import type { TemplateRecord, TemplateVersionRecord } from './template.schema.js';
import {
  type NewTemplateVersion,
  TemplateVersionsRepository,
} from './template-versions.repository.js';
import { type TemplateInfo, TemplatesRepository } from './templates.repository.js';

export type CreateWorkspaceTemplateValues = z.output<typeof createWorkspaceTemplateRequestSchema>;
export type CreateTemplateVersionValues = z.output<typeof createTemplateVersionRequestSchema>;
export type UpdateWorkspaceTemplateValues = z.output<typeof updateWorkspaceTemplateRequestSchema>;

const VERSION_NOT_FOUND = 'Không tìm thấy phiên bản';
const NOT_LIVE = 'Trang chưa có bản live';
const SITE_NOT_YOURS = 'Chỉ chọn được các site của bạn trong workspace';
const SITE_GONE = 'Có site không còn trong workspace';
const KEEPS_EVERY_SITE =
  'Mẫu này đang dùng cho mọi site. Chỉ thành viên của toàn workspace mới giới hạn được nó.';
/** "Tư vấn niềng răng trả góp (bản sao)", within the name's 120 characters. */
const COPY_SUFFIX = ' (bản sao)';
const NAME_MAX = 120;

/** A write refused because the template moved to another version since it was read. */
class VersionMoved extends Error {}

/** The page a version is saved from, as it was: its site, its title, the content taken. */
interface SourceContent {
  site: SiteRecord;
  page: PageRecord;
  kind: TemplateSourcePage['kind'];
  composition: Composition;
}

/** A version ready to insert: its content, its images copied, what lists show of it. */
type PreparedVersion = Omit<NewTemplateVersion, 'templateId' | 'version'>;

function limitReached(): AppError {
  return new AppError(
    409,
    'template_limit_reached',
    `Mỗi workspace có tối đa ${MAX_WORKSPACE_TEMPLATES} template`,
    { detail: 'Template đã lưu trữ vẫn được tính. Hãy lưu thành phiên bản mới của một template.' },
  );
}

function versionLimitReached(name: string): AppError {
  return new AppError(
    409,
    'template_version_limit_reached',
    `Template “${name}” đã có ${MAX_TEMPLATE_VERSIONS} phiên bản`,
    { detail: 'Hãy lưu thành một template mới, hoặc nhân bản template này.' },
  );
}

function copyName(name: string): string {
  return `${name.slice(0, NAME_MAX - COPY_SUFFIX.length).trimEnd()}${COPY_SUFFIX}`;
}

/** The sites the member chose for "Ai được dùng", as ids. */
function chosenSites(requested: TemplateScope): ObjectId[] {
  return requested.kind === 'workspace' ? [] : requested.siteIds.map((id) => toObjectId(id));
}

/**
 * The workspace's own templates (board 19, ADR-030). Every member sees those a site of theirs may
 * use; saving a page as a template, editing, duplicating, archiving and reusing a version need
 * `templates.manage`, and saving also `pages.view` on the page's site. Versions are immutable;
 * nothing is ever deleted.
 */
@Injectable()
export class WorkspaceTemplatesService {
  constructor(
    private readonly access: AccessService,
    private readonly templates: TemplatesRepository,
    private readonly versions: TemplateVersionsRepository,
    private readonly templateAssets: TemplateAssets,
    private readonly sites: SitesRepository,
    private readonly pages: PagesRepository,
    private readonly releases: ReleasesRepository,
    private readonly workspaces: WorkspacesRepository,
    private readonly activity: ActivityRepository,
    private readonly users: UsersRepository,
    private readonly transactions: TransactionRunner,
  ) {}

  /** Board 19: the templates the member sees, archived ones too, last changed first. */
  async list(user: AuthenticatedUser, workspaceId: string): Promise<WorkspaceTemplateListResponse> {
    const scope = await this.viewer(user, workspaceId);
    const templates = (await this.templates.listForWorkspace(scope)).filter((template) =>
      templateVisibleTo(template.scope, scope.siteIds),
    );
    return { items: await this.toDtos(scope, templates) };
  }

  /**
   * "Lưu trang thành template" as a new template. Its images are copied to the template first;
   * the template, its v1 and the activity on the page's site are written in one transaction that
   * counts the workspace's templates (at most `MAX_WORKSPACE_TEMPLATES`).
   */
  async create(
    user: AuthenticatedUser,
    workspaceId: string,
    input: CreateWorkspaceTemplateValues,
  ): Promise<WorkspaceTemplate> {
    const scope = await this.manager(user, workspaceId);
    const source = await this.sourceOf(scope, input.source);
    const wanted = await this.scopeOf(scope, input.scope, null);
    const prepared = await this.prepare(scope, source, input.content, input.note);
    const id = newObjectId();
    const now = new Date();
    await this.writing(prepared, source.site._id, async () => {
      await this.transactions.run(async (tx) => {
        await this.workspaces.recordTemplateCreation(scope, tx);
        if ((await this.templates.countForWorkspace(scope, tx)) >= MAX_WORKSPACE_TEMPLATES) {
          throw limitReached();
        }
        const info: TemplateInfo = {
          name: input.name,
          description: input.description,
          goal: input.goal,
          industry: input.industry,
          scope: await this.heldScope(scope, wanted, chosenSites(input.scope), tx),
        };
        await this.templates.create(scope, { id, info, now }, tx);
        await this.versions.insert(
          scope,
          { ...prepared.version, templateId: id, version: 1 },
          now,
          tx,
        );
        await this.recordSaved(scope, source, input.name, 1, tx);
      });
    });
    return this.dtoOf(scope, id);
  }

  /**
   * "Lưu trang thành template" as the next version of a template the member sees, while
   * `baseVersion` is still its current one (409 `template_changed` otherwise).
   */
  async createVersion(
    user: AuthenticatedUser,
    workspaceId: string,
    templateId: string,
    input: CreateTemplateVersionValues,
  ): Promise<WorkspaceTemplate> {
    const scope = await this.manager(user, workspaceId);
    const template = await this.visible(scope, templateId);
    this.requireNextVersion(template, input.baseVersion);
    const source = await this.sourceOf(scope, input.source);
    const prepared = await this.prepare(scope, source, input.content, input.note);
    const version = input.baseVersion + 1;
    await this.writing(prepared, source.site._id, async () => {
      await this.advancing(scope, template, () =>
        this.transactions.run(async (tx) => {
          const now = new Date();
          const advanced = await this.templates.advanceVersion(
            scope,
            template._id,
            input.baseVersion,
            { name: input.name, now },
            tx,
          );
          if (advanced === null) {
            throw new VersionMoved();
          }
          await this.versions.insert(
            scope,
            { ...prepared.version, templateId: template._id, version },
            now,
            tx,
          );
          await this.recordSaved(scope, source, input.name, version, tx);
        }),
      );
    });
    return this.dtoOf(scope, template._id);
  }

  /** "Sửa thông tin". A member kept to some sites keeps the template's other sites as they are. */
  async update(
    user: AuthenticatedUser,
    workspaceId: string,
    templateId: string,
    input: UpdateWorkspaceTemplateValues,
  ): Promise<WorkspaceTemplate> {
    const scope = await this.manager(user, workspaceId);
    const template = await this.visible(scope, templateId);
    const wanted = await this.scopeOf(scope, input.scope, template.scope);
    const updated = await this.transactions.run(async (tx) => {
      const info: TemplateInfo = {
        name: input.name,
        description: input.description,
        goal: input.goal,
        industry: input.industry,
        scope: await this.heldScope(scope, wanted, chosenSites(input.scope), tx),
      };
      return this.templates.updateInfo(scope, template._id, info, new Date(), tx);
    });
    if (updated === null) {
      throw notFound(TEMPLATE_NOT_FOUND);
    }
    return this.dtoOf(scope, updated._id);
  }

  /**
   * "Nhân bản": a new template, "… (bản sao)", whose v1 is the current version's content. Its
   * images are the same objects: a template's images never change and are never deleted.
   */
  async duplicate(
    user: AuthenticatedUser,
    workspaceId: string,
    templateId: string,
  ): Promise<WorkspaceTemplate> {
    const scope = await this.manager(user, workspaceId);
    const template = await this.visible(scope, templateId);
    const current = await this.versionOf(scope, template._id, template.currentVersion);
    const id = newObjectId();
    const now = new Date();
    await this.transactions.run(async (tx) => {
      await this.workspaces.recordTemplateCreation(scope, tx);
      if ((await this.templates.countForWorkspace(scope, tx)) >= MAX_WORKSPACE_TEMPLATES) {
        throw limitReached();
      }
      await this.templates.create(
        scope,
        {
          id,
          info: {
            name: copyName(template.name),
            description: template.description,
            goal: template.goal,
            industry: template.industry,
            scope: await this.heldScope(scope, template.scope, [], tx),
          },
          now,
        },
        tx,
      );
      await this.versions.insert(
        scope,
        { ...this.contentOf(current), note: '', templateId: id, version: 1, reusedFrom: null },
        now,
        tx,
      );
    });
    return this.dtoOf(scope, id);
  }

  /** "Lưu trữ": out of the library. Archiving an archived template changes nothing. */
  async archive(
    user: AuthenticatedUser,
    workspaceId: string,
    templateId: string,
  ): Promise<WorkspaceTemplate> {
    return this.setArchived(user, workspaceId, templateId, true);
  }

  /** "Khôi phục": back in the library. */
  async restore(
    user: AuthenticatedUser,
    workspaceId: string,
    templateId: string,
  ): Promise<WorkspaceTemplate> {
    return this.setArchived(user, workspaceId, templateId, false);
  }

  /** "Lịch sử phiên bản", newest first, with the pages made from each in the member's sites. */
  async listVersions(
    user: AuthenticatedUser,
    workspaceId: string,
    templateId: string,
  ): Promise<TemplateVersionListResponse> {
    const scope = await this.viewer(user, workspaceId);
    const template = await this.visible(scope, templateId);
    const [versions, counts] = await Promise.all([
      this.versions.listForTemplate(scope, template._id),
      this.pages.countCreatedFromByVersion(scope, template._id.toHexString(), scope.siteIds),
    ]);
    const users = await this.userRefs(versions.map((version) => version.createdBy));
    return {
      items: versions.map((version) => ({
        version: version.version,
        note: version.note,
        // The page is named only to members who open its site (ADR-020): a template every site
        // uses may come from a site the member does not see.
        source: this.access.coversSite(scope, version.source.siteId)
          ? {
              pageId: version.source.pageId.toHexString(),
              pageTitle: version.source.pageTitle,
              kind: version.source.kind,
            }
          : { pageId: null, pageTitle: null, kind: version.source.kind },
        reusedFrom: version.reusedFrom,
        createdBy: refOf(users, version.createdBy),
        createdAt: version.createdAt.toISOString(),
        usedCount: counts.get(version.version) ?? 0,
      })),
    };
  }

  /**
   * "Dùng lại vN": the next version takes vN's content, its images and the page it came from.
   * Versions never change, and pages made from the template keep theirs.
   */
  async reuse(
    user: AuthenticatedUser,
    workspaceId: string,
    templateId: string,
    versionParam: string,
    input: ReuseTemplateVersionRequest,
  ): Promise<WorkspaceTemplate> {
    const scope = await this.manager(user, workspaceId);
    const template = await this.visible(scope, templateId);
    const reused = Number(versionParam);
    if (!Number.isInteger(reused) || reused < 1 || reused > template.currentVersion) {
      throw notFound(VERSION_NOT_FOUND);
    }
    this.requireNextVersion(template, input.baseVersion);
    const old = await this.versionOf(scope, template._id, reused);
    const version = input.baseVersion + 1;
    await this.advancing(scope, template, () =>
      this.transactions.run(async (tx) => {
        const now = new Date();
        const advanced = await this.templates.advanceVersion(
          scope,
          template._id,
          input.baseVersion,
          { now },
          tx,
        );
        if (advanced === null) {
          throw new VersionMoved();
        }
        await this.versions.insert(
          scope,
          {
            ...this.contentOf(old),
            note: '',
            templateId: template._id,
            version,
            reusedFrom: reused,
          },
          now,
          tx,
        );
      }),
    );
    return this.dtoOf(scope, template._id);
  }

  /** Membership, then the permission every member holds: the list and the versions. */
  private async viewer(user: AuthenticatedUser, workspaceId: string): Promise<WorkspaceScope> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, 'pages.view');
    return scope;
  }

  /** Membership, then `templates.manage` (ADR-030). */
  private async manager(user: AuthenticatedUser, workspaceId: string): Promise<WorkspaceScope> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, 'templates.manage');
    return scope;
  }

  /** A template the member sees; any other is not found, as in another workspace (ADR-025). */
  private async visible(scope: WorkspaceScope, templateId: string): Promise<TemplateRecord> {
    const template = await this.templates.findVisible(
      scope,
      toObjectId(templateId, TEMPLATE_NOT_FOUND),
    );
    if (template === null) {
      throw notFound(TEMPLATE_NOT_FOUND);
    }
    return template;
  }

  private async versionOf(
    scope: WorkspaceScope,
    templateId: ObjectId,
    version: number,
  ): Promise<TemplateVersionRecord> {
    const record = await this.versions.find(scope, templateId, version);
    if (record === null) {
      throw new Error(`Template ${templateId.toHexString()} has no version ${version}`);
    }
    return record;
  }

  /** 409 when `baseVersion` is not the current one, or the template has its last version. */
  private requireNextVersion(template: TemplateRecord, baseVersion: number): void {
    if (template.currentVersion !== baseVersion) {
      throw templateChanged(template.name, template.currentVersion);
    }
    if (template.currentVersion >= MAX_TEMPLATE_VERSIONS) {
      throw versionLimitReached(template.name);
    }
  }

  /** Runs a write guarded by the version; a template saved meanwhile answers 409. */
  private async advancing(
    scope: WorkspaceScope,
    template: TemplateRecord,
    write: () => Promise<void>,
  ): Promise<void> {
    try {
      await write();
    } catch (error) {
      if (error instanceof VersionMoved) {
        const current = await this.templates.findById(scope, template._id);
        throw templateChanged(template.name, current?.currentVersion ?? template.currentVersion);
      }
      throw error;
    }
  }

  /**
   * The page a version is saved from: a page of a site the member opens (`pages.view`), its live
   * release or its draft. Anything else is not found, as in another workspace (ADR-025).
   */
  private async sourceOf(
    scope: WorkspaceScope,
    source: TemplateSourcePage,
  ): Promise<SourceContent> {
    this.access.require(scope, 'pages.view');
    const siteId = toObjectId(source.siteId, SITE_NOT_FOUND);
    const site = this.access.coversSite(scope, siteId)
      ? await this.sites.findById(scope, siteId)
      : null;
    if (site === null) {
      throw notFound(SITE_NOT_FOUND);
    }
    const page = await this.pages.findById(scope, toObjectId(source.pageId, PAGE_NOT_FOUND));
    if (page === null || !page.siteId.equals(site._id)) {
      throw notFound(PAGE_NOT_FOUND);
    }
    if (source.kind === 'draft') {
      return { site, page, kind: 'draft', composition: page.draft.composition };
    }
    const release =
      page.publishedReleaseId === null
        ? null
        : await this.releases.findById(scope, page.publishedReleaseId);
    if (release === null) {
      throw new AppError(409, 'page_not_live', NOT_LIVE, {
        detail: 'Lưu từ bản nháp hiện tại, hoặc xuất bản trang trước.',
      });
    }
    return { site, page, kind: 'live', composition: release.composition };
  }

  /**
   * The content of a version saved from a page: never its lead settings, slug or SEO, which the
   * composition does not hold, nor links to its site's pages; texts marked as sample or kept;
   * images copied to the template's own objects.
   */
  private async prepare(
    scope: WorkspaceScope,
    source: SourceContent,
    mode: CreateWorkspaceTemplateValues['content'],
    note: string,
  ): Promise<{ version: PreparedVersion; images: TemplateImages }> {
    const content = templateContentOf(source.composition, mode);
    const images = await this.templateAssets.toTemplate(scope, source.site._id, content);
    const parsed = parseComposition(images.composition);
    if (!parsed.success) {
      await this.templateAssets.discard(
        images.assets.map((asset) => asset.storageKey),
        source.site._id,
      );
      throw validationFailed(
        parsed.issues.map((issue) => ({ ...issue, path: ['composition', ...issue.path] })),
        'Nội dung trang chưa lưu được thành template',
      );
    }
    return {
      version: {
        composition: parsed.composition,
        note,
        source: {
          siteId: source.site._id,
          pageId: source.page._id,
          pageTitle: source.page.title,
          kind: source.kind,
        },
        reusedFrom: null,
        assets: images.assets,
        sections: compositionOutline(parsed.composition),
        hasForm: compositionHasForm(parsed.composition),
      },
      images,
    };
  }

  /** Writes a version whose images were copied; when the write fails, they are deleted. */
  private async writing(
    prepared: { images: TemplateImages },
    siteId: ObjectId,
    write: () => Promise<void>,
  ): Promise<void> {
    try {
      await write();
    } catch (error) {
      await this.templateAssets.discard(
        prepared.images.assets.map((asset) => asset.storageKey),
        siteId,
      );
      throw error;
    }
  }

  /** What a copy of a version keeps: its content, images, source and outline. */
  private contentOf(
    version: TemplateVersionRecord,
  ): Omit<NewTemplateVersion, 'templateId' | 'version' | 'note' | 'reusedFrom'> {
    return {
      composition: version.composition,
      source: version.source,
      assets: version.assets,
      sections: version.sections,
      hasForm: version.hasForm,
    };
  }

  /**
   * "lưu template “X”, phiên bản N" on the page's site. The write conflicts with deleting the
   * site at the same moment (ADR-027): the template is then not saved (404).
   */
  private async recordSaved(
    scope: WorkspaceScope,
    source: SourceContent,
    name: string,
    version: number,
    tx: Tx,
  ): Promise<void> {
    if (!(await this.sites.recordDataWrite(scope, source.site._id, tx))) {
      throw notFound(SITE_NOT_FOUND);
    }
    await this.activity.record(
      scope,
      {
        siteId: source.site._id,
        type: 'template.saved',
        page: { id: source.page._id, title: source.page.title },
        data: { version, template: name },
      },
      tx,
    );
  }

  /**
   * "Ai được dùng" as stored: every requested site must be a site of the workspace the member
   * opens (422 otherwise); the template's sites the member does not see stay. A member kept to
   * some sites cannot limit a template of the whole workspace (422 `narrows_workspace`), which
   * would take it away from the sites they do not see (ADR-030).
   */
  private async scopeOf(
    scope: WorkspaceScope,
    requested: TemplateScope,
    current: TemplateScopeRecord | null,
  ): Promise<TemplateScopeRecord> {
    const siteIds = chosenSites(requested);
    const known = new Set(
      siteIds.length === 0
        ? []
        : (await this.sites.listForWorkspace(scope)).map((site) => site._id.toHexString()),
    );
    const next: ScopeChange = siteIds.every((id) => known.has(id.toHexString()))
      ? scopeAfterChange(
          requested.kind === 'workspace' ? requested : { kind: 'sites', siteIds },
          current,
          scope.siteIds,
        )
      : { ok: false, reason: 'site_not_yours' };
    if (!next.ok) {
      throw validationFailed([
        next.reason === 'site_not_yours'
          ? { path: ['scope', 'siteIds'], code: 'site_not_found', message: SITE_NOT_YOURS }
          : { path: ['scope', 'siteIds'], code: 'narrows_workspace', message: KEEPS_EVERY_SITE },
      ]);
    }
    return next.scope;
  }

  /**
   * The scope as the write in `tx` stores it. Each of its sites is written (`dataSeq`), so
   * deleting one at the same moment either waits and then takes it out of the stored scope, or is
   * seen here as gone (ADR-027). A site the member chose now that is gone: 422; one kept from
   * before (a site they do not see, the scope of the template copied) leaves the scope.
   */
  private async heldScope(
    scope: WorkspaceScope,
    wanted: TemplateScopeRecord,
    chosen: readonly ObjectId[],
    tx: Tx,
  ): Promise<TemplateScopeRecord> {
    if (wanted.kind === 'workspace') {
      return wanted;
    }
    const left = await this.sites.recordDataWrites(scope, wanted.siteIds, tx);
    const isLeft = (id: ObjectId) => left.some((site) => site.equals(id));
    if (!chosen.every(isLeft)) {
      throw validationFailed([
        { path: ['scope', 'siteIds'], code: 'site_not_found', message: SITE_GONE },
      ]);
    }
    return { kind: 'sites', siteIds: wanted.siteIds.filter(isLeft) };
  }

  private async setArchived(
    user: AuthenticatedUser,
    workspaceId: string,
    templateId: string,
    archived: boolean,
  ): Promise<WorkspaceTemplate> {
    const scope = await this.manager(user, workspaceId);
    const template = await this.visible(scope, templateId);
    if ((template.archivedAt !== null) !== archived) {
      const now = new Date();
      const updated = await this.templates.setArchived(
        scope,
        template._id,
        archived ? now : null,
        now,
      );
      if (updated === null) {
        throw notFound(TEMPLATE_NOT_FOUND);
      }
    }
    return this.dtoOf(scope, template._id);
  }

  private async dtoOf(scope: WorkspaceScope, id: ObjectId): Promise<WorkspaceTemplate> {
    const template = await this.templates.findById(scope, id);
    const [dto] = template === null ? [] : await this.toDtos(scope, [template]);
    if (dto === undefined) {
      throw notFound(TEMPLATE_NOT_FOUND);
    }
    return dto;
  }

  /** Rows of board 19, with the outline of each current version and its pages, in 3 queries. */
  private async toDtos(
    scope: WorkspaceScope,
    templates: readonly TemplateRecord[],
  ): Promise<WorkspaceTemplate[]> {
    const [outlines, counts, users] = await Promise.all([
      this.versions.findOutlines(
        scope,
        templates.map((template) => ({
          templateId: template._id,
          version: template.currentVersion,
        })),
      ),
      this.pages.countCreatedFromWorkspaceTemplates(
        scope,
        templates.map((template) => template._id.toHexString()),
        scope.siteIds,
      ),
      this.userRefs(templates.flatMap((template) => [template.createdBy, template.updatedBy])),
    ]);
    return templates.map((template) => {
      const id = template._id.toHexString();
      const outline = outlines.get(id);
      if (outline === undefined) {
        throw new Error(`Template ${id} has no version ${template.currentVersion}`);
      }
      return {
        id,
        name: template.name,
        description: template.description,
        goal: template.goal,
        industry: template.industry,
        scope: scopeDto(template.scope, scope.siteIds),
        currentVersion: template.currentVersion,
        archived: template.archivedAt !== null,
        usedCount: counts.get(id) ?? 0,
        hasForm: outline.hasForm,
        sections: outline.sections,
        createdBy: refOf(users, template.createdBy),
        updatedAt: template.updatedAt.toISOString(),
        updatedBy: refOf(users, template.updatedBy),
      };
    });
  }

  private userRefs(ids: readonly ObjectId[]): Promise<Map<string, UserRef>> {
    return this.users.findRefs(ids);
  }
}

function refOf(users: ReadonlyMap<string, UserRef>, id: ObjectId): UserRef {
  const user = users.get(id.toHexString());
  if (user === undefined) {
    throw new Error(`A template refers to unknown user ${id.toHexString()}`);
  }
  return user;
}
