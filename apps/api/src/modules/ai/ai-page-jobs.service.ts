import { randomUUID } from 'node:crypto';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import {
  type AiJob,
  type aiPageJobRequestSchema,
  type AiUsage,
  MAX_PAGES_PER_SITE,
} from '@plp/contracts';
import { getSectionDefinition } from '@plp/sections/schema';
import type { z } from 'zod';
import type { Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import { AppError, notFound, validationFailed } from '../../shared/errors.js';
import { toObjectId } from '../../shared/persistence/object-id.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import type { WorkspaceRef } from '../../shared/persistence/workspace-databases.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { PagesRepository } from '../pages/pages.repository.js';
import { PAGE_LIMIT_MESSAGE } from '../pages/pages.service.js';
import { newSectionId } from '../pages/section-id.js';
import type { SiteRecord } from '../sites/site.schema.js';
import { SitesService } from '../sites/sites.service.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { WorkspacesRepository } from '../workspaces/workspaces.repository.js';
import { toAiJob } from './ai-job-dto.js';
import { AiJobLedger, stoppedSections } from './ai-job-ledger.js';
import { type AiRunHandle, AiJobRunner } from './ai-job-runner.js';
import type { AiJobRecord, AiJobRunRecord, AiJobSectionRecord } from './ai-job.schema.js';
import { AiJobsRepository } from './ai-jobs.repository.js';
import { AiClock, AiQuota } from './ai-quota.service.js';
import {
  AI_JOB_RETENTION_DAYS,
  RUN_GRACE_MS,
  runBudgetMs,
  type RunStopReason,
} from './domain/job-rules.js';
import type { PromptContext } from './domain/prompts.js';
import { copyPlanOf, isEmptyPlan } from './domain/section-copy.js';
import { compositionFromStructure } from './domain/structure.js';

export type AiPageJobValues = z.output<typeof aiPageJobRequestSchema>;

const JOB_NOT_FOUND = 'Không tìm thấy lần tạo trang bằng AI này';
const SLUG_TAKEN_MESSAGE = 'Đường dẫn này đã được một trang khác trong site dùng';
const DAY_MS = 86_400_000;

function conflict(title: string, detail?: string): AppError {
  return new AppError(409, 'conflict', title, detail === undefined ? {} : { detail });
}

/** What the prompt says about the page's sections: their names, in order. */
function outlineOf(sections: readonly Pick<AiJobSectionRecord, 'type'>[]): string[] {
  return sections.map((section) => getSectionDefinition(section.type).label);
}

/**
 * Creating a page with AI (ADR-031, board 20): `pages.edit` on the site. Starting reserves one use
 * of the month and hands the job to `AiJobRunner`; "Thử lại" runs the failed sections again for no
 * use; "Hủy" ends a run. A run that outlived its deadline (its API stopped) is ended by whoever
 * reads the job or the usage next, and at startup, and a first run gives its use back.
 */
@Injectable()
export class AiPageJobsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AiPageJobsService.name);

  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly sites: SitesService,
    private readonly pages: PagesRepository,
    private readonly jobs: AiJobsRepository,
    private readonly ledger: AiJobLedger,
    private readonly quota: AiQuota,
    private readonly runner: AiJobRunner,
    private readonly transactions: TransactionRunner,
    private readonly workspaces: WorkspacesRepository,
    private readonly clock: AiClock,
  ) {}

  /** "Còn N/100 lượt tháng này", after giving back the uses of runs that died. */
  async usage(user: AuthenticatedUser, siteId: string): Promise<AiUsage> {
    const { scope } = await this.sites.access(user, siteId, 'pages.edit');
    await this.expireStale(scope);
    return this.quota.usageOf(scope);
  }

  /**
   * "Viết nội dung · tốn 1 lượt". Everything that can be refused is checked before the use is
   * reserved: the structure (by the registry), the slug, the site's page limit. The draft is
   * created at the end, when at least one section was written.
   */
  async start(
    user: AuthenticatedUser,
    siteId: string,
    input: AiPageJobValues,
  ): Promise<AiRunHandle> {
    const { scope, site } = await this.sites.access(user, siteId, 'pages.edit');
    this.quota.requireEnabled();
    await this.quota.throttle(scope.userId);
    const built = compositionFromStructure({
      structure: input.structure,
      goal: input.brief.goal,
      siteName: site.name,
      newId: newSectionId,
    });
    if (!built.ok) {
      throw validationFailed(built.issues, 'Cấu trúc trang không hợp lệ');
    }
    const sections = built.composition.sections.map((section): AiJobSectionRecord => ({
      id: section.id,
      type: section.type,
      variant: section.variant,
      status: isEmptyPlan(copyPlanOf(section)) ? 'kept' : 'queued',
      failure: null,
    }));
    const queued = sections.filter((section) => section.status === 'queued').length;
    if (queued === 0) {
      throw validationFailed(
        [
          {
            path: ['structure'],
            code: 'nothing_to_write',
            message: 'Thêm ít nhất một section có chữ để AI viết',
          },
        ],
        'Cấu trúc trang không hợp lệ',
      );
    }
    await this.requireRoomFor(scope, site, input.slug);
    await this.expireStale(scope);
    const month = await this.quota.prepare(scope);
    const now = this.clock.now();
    const job = await this.transactions.run(async (tx) => {
      await this.quota.reserve(scope, month, tx);
      return this.jobs.insert(
        scope,
        {
          siteId: site._id,
          title: input.title,
          slug: input.slug,
          brief: input.brief,
          sections,
          run: this.newRun(queued),
          month,
          now,
          expiresAt: new Date(now.getTime() + AI_JOB_RETENTION_DAYS * DAY_MS),
        },
        tx,
      );
    });
    return this.runner.start({
      scope,
      site,
      job,
      base: built.composition,
      context: this.contextOf(site, job),
    });
  }

  async get(user: AuthenticatedUser, siteId: string, jobId: string): Promise<AiJob> {
    const { scope, site } = await this.sites.access(user, siteId, 'pages.edit');
    return toAiJob(await this.current(scope, await this.find(scope, site, jobId)));
  }

  /**
   * "Thử lại N section": the failed sections of a job that wrote its draft, written into that draft
   * while nobody edited it, without another use, at most `AI_RETRIES_PER_JOB` times.
   */
  async retry(user: AuthenticatedUser, siteId: string, jobId: string): Promise<AiRunHandle> {
    const { scope, site } = await this.sites.access(user, siteId, 'pages.edit');
    this.quota.requireEnabled();
    await this.quota.throttle(scope.userId);
    const job = await this.current(scope, await this.find(scope, site, jobId));
    if (job.status === 'running') {
      throw conflict('AI vẫn đang viết trang này');
    }
    if (job.status !== 'done' || job.pageId === null) {
      throw conflict('Lần tạo này không có bản nháp để viết tiếp', 'Bắt đầu lại từ brief.');
    }
    const failed = job.sections.filter((section) => section.status === 'failed');
    if (failed.length === 0) {
      throw conflict('Không còn section nào cần viết lại');
    }
    if (toAiJob(job).retriesLeft === 0) {
      throw conflict('Đã hết lượt thử lại', 'Mở bản nháp để thay chữ mẫu của các section còn lại.');
    }
    const page = await this.pages.findById(scope, job.pageId);
    if (page === null || !page.siteId.equals(site._id)) {
      throw conflict('Bản nháp của lần tạo này không còn nữa');
    }
    if (page.draft.revision !== job.pageRevision) {
      throw new AppError(409, 'revision_conflict', 'Bản nháp đã được sửa sau khi AI viết', {
        detail: 'Mở bản nháp để sửa tiếp các section còn chữ mẫu.',
        context: { currentRevision: page.draft.revision },
      });
    }
    const started = await this.jobs.startRetry(
      scope,
      job,
      this.newRun(failed.length),
      job.sections.map((section) =>
        section.status === 'failed' ? { ...section, status: 'queued', failure: null } : section,
      ),
    );
    if (started === null) {
      throw conflict('Lần tạo này vừa thay đổi', 'Tải lại màn hình rồi thử lại.');
    }
    return this.runner.start({
      scope,
      site,
      job: started,
      base: page.draft.composition,
      context: this.contextOf(site, started),
    });
  }

  /** "Hủy": a first run writes no draft and gives its use back; a "Thử lại" run leaves it. */
  async cancel(user: AuthenticatedUser, siteId: string, jobId: string): Promise<AiJob> {
    const { scope, site } = await this.sites.access(user, siteId, 'pages.edit');
    const job = await this.find(scope, site, jobId);
    if (job.status === 'running' && job.run !== null) {
      await this.endRun(scope, job, job.run.id, 'cancelled');
      this.runner.stop(job._id, 'cancelled');
    }
    return toAiJob((await this.jobs.findById(scope, job._id)) ?? job);
  }

  /** Ends the runs that outlived their deadline in every workspace, after a restart. */
  async onApplicationBootstrap(): Promise<void> {
    for await (const workspaceId of this.workspaces.allIds()) {
      try {
        await this.expireStale({ workspaceId });
      } catch (error) {
        this.logger.error(
          { err: error, workspaceId: workspaceId.toHexString() },
          'AI jobs of a workspace not ended at startup',
        );
      }
    }
  }

  /** Ends the runs of the workspace past their deadline that no runner of this process holds. */
  async expireStale(ref: WorkspaceRef): Promise<void> {
    for (const job of await this.jobs.findStale(ref, new Date())) {
      if (job.run !== null && !this.runner.isRunning(job._id)) {
        await this.endRun(ref, job, job.run.id, 'deadline');
      }
    }
  }

  /** The job, its run ended first when it outlived its deadline. */
  private async current(ref: WorkspaceRef, job: AiJobRecord): Promise<AiJobRecord> {
    if (
      job.status !== 'running' ||
      job.run === null ||
      job.run.deadline.getTime() >= Date.now() ||
      this.runner.isRunning(job._id)
    ) {
      return job;
    }
    await this.endRun(ref, job, job.run.id, 'deadline');
    return (await this.jobs.findById(ref, job._id)) ?? job;
  }

  private endRun(
    ref: WorkspaceRef,
    job: AiJobRecord,
    runId: string,
    reason: Exclude<RunStopReason, 'shutdown'>,
  ): Promise<boolean> {
    const cancelled = reason === 'cancelled';
    return this.ledger.endWithoutWriting(ref, job, runId, {
      status: cancelled ? 'cancelled' : 'failed',
      sections: stoppedSections(job.sections, 'interrupted'),
      // A cancelled first run is no failure; a stopped "Thử lại" leaves its sections to write.
      failure: cancelled && job.pageId === null ? null : 'interrupted',
    });
  }

  private async find(scope: WorkspaceScope, site: SiteRecord, jobId: string): Promise<AiJobRecord> {
    const job = await this.jobs.findInSite(scope, site._id, toObjectId(jobId, JOB_NOT_FOUND));
    if (job === null) {
      throw notFound(JOB_NOT_FOUND);
    }
    return job;
  }

  /** 409 `slug_taken` or `page_limit_reached` before a use is reserved; the end checks again. */
  private async requireRoomFor(
    scope: WorkspaceScope,
    site: SiteRecord,
    slug: string,
  ): Promise<void> {
    const owner = await this.pages.findSlugOwner(scope, site._id, slug, null);
    if (owner !== null) {
      throw new AppError(409, 'slug_taken', SLUG_TAKEN_MESSAGE, {
        issues: [{ path: ['slug'], code: 'slug_taken', message: SLUG_TAKEN_MESSAGE }],
      });
    }
    if ((await this.pages.countForSite(scope, site._id)) >= MAX_PAGES_PER_SITE) {
      throw new AppError(409, 'page_limit_reached', PAGE_LIMIT_MESSAGE);
    }
  }

  /** A run for `sections` sections: its id, and its deadline past the budget and the grace. */
  private newRun(sections: number): AiJobRunRecord {
    return {
      id: randomUUID(),
      deadline: new Date(Date.now() + runBudgetMs(sections, this.env.AI_TIMEOUT_MS) + RUN_GRACE_MS),
    };
  }

  private contextOf(site: SiteRecord, job: AiJobRecord): PromptContext {
    return { siteName: site.name, brief: job.brief, outline: outlineOf(job.sections) };
  }
}
