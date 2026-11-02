import { AI_RETRIES_PER_JOB, type AiJob } from '@plp/contracts';
import type { AiJobRecord } from './ai-job.schema.js';

/** A job as the admin reads it: no brief, no run, no quota bookkeeping. */
export function toAiJob(
  job: Pick<AiJobRecord, '_id' | 'status' | 'sections' | 'pageId' | 'retries' | 'failure'>,
): AiJob {
  return {
    id: job._id.toHexString(),
    status: job.status,
    sections: job.sections.map(({ id, type, variant, status }) => ({ id, type, variant, status })),
    pageId: job.pageId?.toHexString() ?? null,
    retriesLeft: Math.max(0, AI_RETRIES_PER_JOB - job.retries),
    failure: job.failure,
  };
}
