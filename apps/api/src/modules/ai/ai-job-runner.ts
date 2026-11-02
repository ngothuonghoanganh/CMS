import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import {
  type AiFailure,
  type AiJob,
  type AiJobEvent,
  type AiSectionStatus,
  type Composition,
  MAX_SECTIONS,
  type SectionInstance,
} from '@plp/contracts';
import { parseComposition } from '@plp/sections/schema';
import type { Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import { AppError } from '../../shared/errors.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import { TaskLimiter } from '../../shared/task-limiter.js';
import { PagesRepository } from '../pages/pages.repository.js';
import { PagesService } from '../pages/pages.service.js';
import type { SiteRecord } from '../sites/site.schema.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { toAiJob } from './ai-job-dto.js';
import { AiJobLedger, stoppedSections } from './ai-job-ledger.js';
import type { AiJobRecord, AiJobSectionRecord } from './ai-job.schema.js';
import { AiJobsRepository } from './ai-jobs.repository.js';
import { AiError } from './ai-text-model.js';
import {
  failureOfError,
  RUN_GRACE_MS,
  type RunStopReason,
  summarizeFailures,
} from './domain/job-rules.js';
import type { PromptContext } from './domain/prompts.js';
import {
  SectionWriter,
  type SectionWriteResult,
  type TokenCount,
} from './section-writer.service.js';

/** What a run starts from. */
export interface RunSpec {
  scope: WorkspaceScope;
  site: SiteRecord;
  /** The job, running, with this run's id and deadline. */
  job: AiJobRecord;
  /** The draft the sections are written into: built from the structure, or the job's draft. */
  base: Composition;
  context: PromptContext;
}

/** A run as the request that started it follows it. */
export interface AiRunHandle {
  /** The job as the run started. */
  job: AiJob;
  /** Calls `listener` with each section's progress, those so far first; returns the unsubscribe. */
  subscribe(listener: (event: AiJobEvent) => void): () => void;
  /** The job once the run ended; never rejects. */
  done: Promise<AiJob>;
}

type SectionOutcome =
  { status: 'done'; section: SectionInstance } | { status: 'failed'; failure: AiFailure };

/** The run was ended by a cancel or a reader while it committed: it must write nothing. */
class RunSupersededError extends Error {
  constructor() {
    super('The AI job run was ended before it committed');
    this.name = 'RunSupersededError';
  }
}

class ActiveRun {
  readonly controller = new AbortController();
  readonly events: AiJobEvent[] = [];
  readonly listeners = new Set<(event: AiJobEvent) => void>();
  stopReason: RunStopReason | null = null;

  emit(event: AiJobEvent): void {
    this.events.push(event);
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  stop(reason: RunStopReason): void {
    if (this.stopReason === null) {
      this.stopReason = reason;
      this.controller.abort(reason);
    }
  }
}

/** A page draft failure that ends a job without a draft, and why. */
function draftFailureOf(error: unknown): AiFailure | null {
  if (!(error instanceof AppError)) {
    return null;
  }
  if (error.code === 'slug_taken') {
    return 'slug_taken';
  }
  if (error.code === 'page_limit_reached') {
    return 'page_limit_reached';
  }
  // The site was deleted while the AI wrote (ADR-027).
  return error.code === 'not_found' ? 'interrupted' : null;
}

/**
 * Runs AI jobs in this process (ADR-031): writes the queued sections `AI_CONCURRENCY` at a time,
 * reports each one's progress to whoever listens, then ends the job in one transaction: the draft
 * and the job together, or no draft and the use given back. The request that started a run only
 * listens, so a client that goes away does not stop it. Runs stop at their budget, on cancel and
 * when the API stops; a run whose process died is ended by a reader past its deadline
 * (`AiPageJobsService`). A run whose job was ended elsewhere (a cancel on another instance, its
 * site deleted) stops at its next write or before its next request, which name its id.
 */
@Injectable()
export class AiJobRunner implements OnModuleDestroy {
  private readonly logger = new Logger(AiJobRunner.name);
  private readonly runs = new Map<string, { run: ActiveRun; done: Promise<AiJob> }>();

  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly writer: SectionWriter,
    private readonly jobs: AiJobsRepository,
    private readonly ledger: AiJobLedger,
    private readonly pagesService: PagesService,
    private readonly pages: PagesRepository,
    private readonly transactions: TransactionRunner,
  ) {}

  /** Whether this process runs the job now. */
  isRunning(jobId: ObjectId): boolean {
    return this.runs.has(jobId.toHexString());
  }

  /** Stops the job's run in this process, if it runs here. */
  stop(jobId: ObjectId, reason: RunStopReason): void {
    this.runs.get(jobId.toHexString())?.run.stop(reason);
  }

  start(spec: RunSpec): AiRunHandle {
    const runRecord = spec.job.run;
    if (runRecord === null) {
      throw new Error(`AI job ${spec.job._id.toHexString()} has no run to start`);
    }
    const key = spec.job._id.toHexString();
    const run = new ActiveRun();
    const budget = runRecord.deadline.getTime() - RUN_GRACE_MS - Date.now();
    const timer = setTimeout(
      () => {
        run.stop('deadline');
      },
      Math.max(0, budget),
    );
    // A pending deadline never keeps the process alive; shutdown stops the run anyway.
    timer.unref();
    const done = this.execute(spec, runRecord.id, run)
      .catch(async (error: unknown) => {
        this.logger.error({ err: error, jobId: key }, 'AI job run failed');
        return this.endAfterFailure(spec, runRecord.id);
      })
      .finally(() => {
        clearTimeout(timer);
        this.runs.delete(key);
      });
    this.runs.set(key, { run, done });
    return {
      job: toAiJob(spec.job),
      subscribe: (listener) => {
        for (const event of run.events) {
          listener(event);
        }
        run.listeners.add(listener);
        return () => {
          run.listeners.delete(listener);
        };
      },
      done,
    };
  }

  /** Stops every run of this process; each still ends its job (with what it wrote) before exit. */
  async onModuleDestroy(): Promise<void> {
    const active = [...this.runs.values()];
    for (const { run } of active) {
      run.stop('shutdown');
    }
    await Promise.allSettled(active.map(({ done }) => done));
  }

  private async execute(spec: RunSpec, runId: string, run: ActiveRun): Promise<AiJob> {
    const { scope, job } = spec;
    const base = new Map(spec.base.sections.map((section) => [section.id, section]));
    const limiter = new TaskLimiter({ running: this.env.AI_CONCURRENCY, waiting: MAX_SECTIONS });
    const outcomes = new Map<string, SectionOutcome>();
    const tokens: TokenCount = { input: 0, output: 0 };
    const startedAt = Date.now();
    const queued = job.sections.filter((section) => section.status === 'queued');
    await Promise.all(
      queued.map((item) =>
        limiter.run(async () => {
          const outcome = await this.writeSection(
            spec,
            runId,
            run,
            item,
            base.get(item.id),
            tokens,
          );
          outcomes.set(item.id, outcome);
        }),
      ),
    );
    const sections = job.sections.map((section): AiJobSectionRecord => {
      const outcome = outcomes.get(section.id);
      if (outcome === undefined) {
        return section;
      }
      return outcome.status === 'done'
        ? { ...section, status: 'done', failure: null }
        : { ...section, status: 'failed', failure: outcome.failure };
    });
    const written = new Map(
      [...outcomes].flatMap(([id, outcome]) =>
        outcome.status === 'done' ? [[id, outcome.section] as const] : [],
      ),
    );
    const failure = summarizeFailures(
      sections.flatMap((section) => (section.failure === null ? [] : [section.failure])),
    );
    if (written.size === 0) {
      await this.ledger.endWithoutWriting(scope, job, runId, {
        status: 'failed',
        sections,
        failure,
      });
    } else if (job.pageId === null) {
      await this.createDraft(spec, runId, written, sections, failure);
    } else {
      await this.updateDraft(spec, job.pageId, runId, written, sections, failure);
    }
    const ended = await this.jobs.findById(scope, job._id);
    if (ended === null) {
      // Deleted with its site (ADR-027), whose deletion gave a first run's use back.
      this.logger.log({ jobId: job._id.toHexString() }, 'AI job deleted with its site as it ran');
      return toAiJob({ ...job, status: 'failed', sections, failure: 'interrupted' });
    }
    this.logger.log(
      {
        jobId: job._id.toHexString(),
        status: ended.status,
        written: written.size,
        failed: sections.filter((section) => section.status === 'failed').length,
        inputTokens: tokens.input,
        outputTokens: tokens.output,
        ms: Date.now() - startedAt,
      },
      'AI job run ended',
    );
    return toAiJob(ended);
  }

  private async writeSection(
    spec: RunSpec,
    runId: string,
    run: ActiveRun,
    item: AiJobSectionRecord,
    section: SectionInstance | undefined,
    tokens: TokenCount,
  ): Promise<SectionOutcome> {
    if (section === undefined) {
      throw new Error(
        `Section ${item.id} of AI job ${spec.job._id.toHexString()} is not in its draft`,
      );
    }
    const stopped = (): SectionOutcome => ({
      status: 'failed',
      failure: run.stopReason === 'deadline' ? 'ai_timeout' : 'interrupted',
    });
    if (!run.controller.signal.aborted) {
      // The write names the run: a job ended elsewhere stops it here, before the AI is asked.
      await this.progress(spec, runId, run, item.id, 'writing', null);
    }
    let outcome: SectionOutcome;
    if (run.controller.signal.aborted) {
      outcome = stopped();
    } else {
      const result = await this.writeOrFail(spec, runId, section, run);
      tokens.input += result.tokens.input;
      tokens.output += result.tokens.output;
      if (result.status === 'written') {
        outcome = { status: 'done', section: result.section };
      } else if (result.status === 'invalid') {
        outcome = { status: 'failed', failure: 'ai_invalid_output' };
      } else {
        outcome = { status: 'failed', failure: failureOfError(result.error.kind, run.stopReason) };
        // The kind and status say what happened; an AiError never holds the prompt or answer.
        this.logger.warn(
          { err: result.error, jobId: spec.job._id.toHexString(), sectionType: section.type },
          'AI section not written',
        );
      }
    }
    await this.progress(
      spec,
      runId,
      run,
      item.id,
      outcome.status,
      outcome.status === 'failed' ? outcome.failure : null,
    );
    return outcome;
  }

  /**
   * The section written, or failed for the service when the writer itself broke (a defect, which
   * is logged): one section's failure never stops the others or the job's end.
   */
  private async writeOrFail(
    spec: RunSpec,
    runId: string,
    section: SectionInstance,
    run: ActiveRun,
  ): Promise<SectionWriteResult> {
    try {
      return await this.writer.write(spec.context, section, run.controller.signal, () =>
        this.stopUnlessCurrent(spec, runId, run),
      );
    } catch (error) {
      this.logger.error(
        { err: error, jobId: spec.job._id.toHexString(), sectionType: section.type },
        'AI section writer failed',
      );
      return {
        status: 'error',
        error: new AiError('unavailable', 'The section writer failed'),
        tokens: { input: 0, output: 0 },
      };
    }
  }

  /**
   * Records a section's progress and tells the listeners. The record only serves a client that
   * reads the job again: when it fails, the run goes on, and its end writes every section. When it
   * matches no job, the run is no longer the job's and stops: nothing it writes would be kept.
   */
  private async progress(
    spec: RunSpec,
    runId: string,
    run: ActiveRun,
    sectionId: string,
    status: AiSectionStatus,
    failure: AiFailure | null,
  ): Promise<void> {
    run.emit({ type: 'section', sectionId, status });
    try {
      if (
        !(await this.jobs.setSectionStatus(
          spec.scope,
          spec.job._id,
          runId,
          sectionId,
          status,
          failure,
        ))
      ) {
        run.stop('superseded');
      }
    } catch (error) {
      this.logger.error(
        { err: error, jobId: spec.job._id.toHexString() },
        'AI job progress not recorded',
      );
    }
  }

  /**
   * Stops the run when it is no longer the job's, before a retry asks the AI again. A failed read
   * is logged and the run goes on: its end is conditional anyway.
   */
  private async stopUnlessCurrent(spec: RunSpec, runId: string, run: ActiveRun): Promise<void> {
    try {
      if (!(await this.jobs.isRunCurrent(spec.scope, spec.job._id, runId))) {
        run.stop('superseded');
      }
    } catch (error) {
      this.logger.error(
        { err: error, jobId: spec.job._id.toHexString() },
        'AI job run not checked before a retry',
      );
    }
  }

  /** The draft of a first run and the job's end, in one transaction (ADR-031). */
  private async createDraft(
    spec: RunSpec,
    runId: string,
    written: ReadonlyMap<string, SectionInstance>,
    sections: AiJobSectionRecord[],
    failure: AiFailure | null,
  ): Promise<void> {
    const { scope, site, job } = spec;
    const composition = this.withWritten(spec.base, written);
    try {
      await this.transactions.run(async (tx) => {
        const page = await this.pagesService.insertPage(
          scope,
          site,
          {
            title: job.title,
            slug: job.slug,
            goal: job.brief.goal,
            composition,
            createdFrom: null,
            template: null,
          },
          tx,
        );
        const ended = await this.jobs.endRun(
          scope,
          job._id,
          runId,
          {
            status: 'done',
            sections,
            failure,
            pageId: page._id,
            pageRevision: page.draft.revision,
          },
          tx,
        );
        if (!ended) {
          throw new RunSupersededError();
        }
      });
    } catch (error) {
      if (error instanceof RunSupersededError) {
        return;
      }
      const draftFailure = draftFailureOf(error);
      if (draftFailure === null) {
        throw error;
      }
      // Nothing reached a draft: the job failed for the page itself, and the use goes back.
      await this.ledger.endWithoutWriting(scope, job, runId, {
        status: 'failed',
        sections,
        failure: draftFailure,
      });
    }
  }

  /**
   * "Thử lại": the new sections go into the job's draft only while it is the revision the job
   * wrote, as autosave would (ADR-005). Edited meanwhile, the draft stays and the sections count
   * as failed.
   */
  private async updateDraft(
    spec: RunSpec,
    pageId: ObjectId,
    runId: string,
    written: ReadonlyMap<string, SectionInstance>,
    sections: AiJobSectionRecord[],
    failure: AiFailure | null,
  ): Promise<void> {
    const { scope, job } = spec;
    const revision = job.pageRevision;
    let applied: boolean;
    try {
      applied = await this.transactions.run(async (tx) => {
        const page = await this.pages.findById(scope, pageId, tx);
        if (page === null || revision === null || page.draft.revision !== revision) {
          return false;
        }
        const saved = await this.pages.replaceDraft(
          scope,
          pageId,
          revision,
          {
            slug: page.draft.slug,
            composition: this.withWritten(page.draft.composition, written),
            seo: page.draft.seo,
          },
          tx,
        );
        if (saved === null) {
          return false;
        }
        const ended = await this.jobs.endRun(
          scope,
          job._id,
          runId,
          { status: 'done', sections, failure, pageRevision: saved.draft.revision },
          tx,
        );
        if (!ended) {
          throw new RunSupersededError();
        }
        return true;
      });
    } catch (error) {
      if (error instanceof RunSupersededError) {
        return;
      }
      throw error;
    }
    if (!applied) {
      await this.ledger.endWithoutWriting(scope, job, runId, {
        status: 'failed',
        sections: sections.map((section) =>
          written.has(section.id)
            ? { ...section, status: 'failed', failure: 'draft_changed' }
            : section,
        ),
        failure: 'draft_changed',
      });
    }
  }

  /** `base` with the written sections in place, as the registry parses it. */
  private withWritten(
    base: Composition,
    written: ReadonlyMap<string, SectionInstance>,
  ): Composition {
    const parsed = parseComposition({
      version: 1,
      sections: base.sections.map((section) => written.get(section.id) ?? section),
    });
    if (!parsed.success) {
      throw new Error(
        `The AI job's draft is not a valid composition: ${JSON.stringify(parsed.issues.map(({ path, code }) => ({ path, code })))}`,
      );
    }
    return parsed.composition;
  }

  /**
   * After an unexpected failure: ends the run without a draft if it is still running, so its use
   * goes back, and answers with the job as it stands. A failure here is logged too.
   */
  private async endAfterFailure(spec: RunSpec, runId: string): Promise<AiJob> {
    const { scope, job } = spec;
    try {
      const current = (await this.jobs.findById(scope, job._id)) ?? job;
      if (current.status === 'running' && current.run?.id === runId) {
        await this.ledger.endWithoutWriting(scope, current, runId, {
          status: 'failed',
          sections: stoppedSections(current, 'ai_unavailable'),
          failure: 'ai_unavailable',
        });
      }
      return toAiJob((await this.jobs.findById(scope, job._id)) ?? current);
    } catch (error) {
      this.logger.error(
        { err: error, jobId: job._id.toHexString() },
        'AI job not ended after its run failed; a reader ends it past its deadline',
      );
      return toAiJob({ ...job, status: 'failed', failure: 'ai_unavailable' });
    }
  }
}
