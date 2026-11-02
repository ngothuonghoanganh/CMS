import { Injectable } from '@nestjs/common';
import type { AiFailure } from '@plp/contracts';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import type { WorkspaceRef } from '../../shared/persistence/workspace-databases.js';
import type { AiJobRecord, AiJobSectionRecord } from './ai-job.schema.js';
import { AiJobsRepository } from './ai-jobs.repository.js';
import { AiQuota } from './ai-quota.service.js';

/**
 * The sections of a run that stopped without writing its draft: those it had not finished failed,
 * for `failure`. A "Thử lại" run also fails the sections it wrote: they never reached the job's
 * draft, and "Thử lại" can write them again. A first run had no draft to keep them.
 */
export function stoppedSections(
  job: Pick<AiJobRecord, 'sections' | 'pageId' | 'run'>,
  failure: AiFailure,
): AiJobSectionRecord[] {
  const written = new Set(job.pageId === null ? [] : job.run?.sectionIds);
  return job.sections.map((section) =>
    section.status === 'queued' ||
    section.status === 'writing' ||
    (section.status === 'done' && written.has(section.id))
      ? { ...section, status: 'failed', failure }
      : section,
  );
}

/**
 * Ends runs that write nothing into a draft: nothing written, cancelled, or past their deadline
 * (ADR-031). A first run has no draft, so its use goes back in the same transaction; the job's
 * conditional update makes sure only one of these ends a run, so the use goes back once. A "Thử
 * lại" run used nothing, and its draft stays as it was.
 */
@Injectable()
export class AiJobLedger {
  constructor(
    private readonly jobs: AiJobsRepository,
    private readonly quota: AiQuota,
    private readonly transactions: TransactionRunner,
  ) {}

  /** False when the run had already ended another way. */
  endWithoutWriting(
    ref: WorkspaceRef,
    job: Pick<AiJobRecord, '_id' | 'pageId' | 'quota'>,
    runId: string,
    end: {
      status: 'failed' | 'cancelled';
      sections: AiJobSectionRecord[];
      failure: AiFailure | null;
    },
  ): Promise<boolean> {
    const firstRun = job.pageId === null;
    const refund = firstRun && !job.quota.refunded;
    return this.transactions.run(async (tx) => {
      const ended = await this.jobs.endRun(
        ref,
        job._id,
        runId,
        {
          // A "Thử lại" run leaves the job as it was before: done, with its draft.
          status: firstRun ? end.status : 'done',
          sections: end.sections,
          failure: end.failure,
          ...(refund ? { refunded: true } : {}),
        },
        tx,
      );
      if (ended && refund) {
        await this.quota.refund(ref, job.quota.month, tx);
      }
      return ended;
    });
  }
}
