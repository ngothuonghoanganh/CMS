import type { AiFailure } from '@plp/contracts';
import type { AiErrorKind } from '../ai-text-model.js';

/** AI requests one user may send per minute, across workspaces (ADR-031). */
export const AI_REQUESTS_PER_MINUTE = 10;

/** Jobs are kept this long, then deleted (TTL): the brief need not stay longer. */
export const AI_JOB_RETENTION_DAYS = 30;

/**
 * Time a run's commit may take after its budget. Only a job past its budget and this grace is
 * ended by a reader: its own runner has stopped by then, or its process has.
 */
export const RUN_GRACE_MS = 60_000;

/**
 * How long a run may take: every section in rounds of `concurrency` (`AI_CONCURRENCY`), each with
 * its one retry, each request up to `timeoutMs`. A run that has not ended by then is stopped.
 */
export function runBudgetMs(sectionCount: number, timeoutMs: number, concurrency: number): number {
  const rounds = Math.max(1, Math.ceil(sectionCount / concurrency));
  return rounds * 2 * timeoutMs;
}

/**
 * Why a run stopped a request early. `superseded`: its job was ended another way (a cancel or a
 * reader past its deadline), maybe on another instance (ADR-004), so whatever it writes is lost.
 */
export type RunStopReason = 'cancelled' | 'deadline' | 'shutdown' | 'superseded';

/** What a failed AI request means for its section. */
export function failureOfError(kind: AiErrorKind, stop: RunStopReason | null): AiFailure {
  switch (kind) {
    case 'overloaded':
      return 'ai_overloaded';
    case 'timeout':
      return 'ai_timeout';
    case 'aborted':
      return stop === 'deadline' ? 'ai_timeout' : 'interrupted';
    case 'disabled':
    case 'unavailable':
    case 'rejected':
    case 'bad_response':
      return 'ai_unavailable';
  }
}

/** The order in which a job names why it wrote nothing: what the user can act on first. */
const FAILURE_PRIORITY: readonly AiFailure[] = [
  'ai_overloaded',
  'ai_timeout',
  'ai_unavailable',
  'ai_invalid_output',
  'interrupted',
];

/** The one reason a job gives for its failed sections, or null when none failed. */
export function summarizeFailures(failures: readonly AiFailure[]): AiFailure | null {
  if (failures.length === 0) {
    return null;
  }
  return FAILURE_PRIORITY.find((failure) => failures.includes(failure)) ?? failures[0] ?? null;
}
