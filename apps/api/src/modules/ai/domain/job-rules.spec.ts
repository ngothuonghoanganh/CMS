import { describe, expect, it } from 'vitest';
import { failureOfError, runBudgetMs, summarizeFailures } from './job-rules.js';

describe('AI job rules (ADR-031)', () => {
  it('gives a run time for every round of sections, each with its one retry', () => {
    expect(runBudgetMs(1, 60_000)).toBe(120_000);
    expect(runBudgetMs(3, 60_000)).toBe(120_000);
    expect(runBudgetMs(7, 60_000)).toBe(360_000);
  });

  it('names what a failed request means for its section', () => {
    expect(failureOfError('overloaded', null)).toBe('ai_overloaded');
    expect(failureOfError('timeout', null)).toBe('ai_timeout');
    expect(failureOfError('rejected', null)).toBe('ai_unavailable');
    expect(failureOfError('bad_response', null)).toBe('ai_unavailable');
    // Stopped at the run's budget, the request ran out of time; on shutdown it was interrupted.
    expect(failureOfError('aborted', 'deadline')).toBe('ai_timeout');
    expect(failureOfError('aborted', 'shutdown')).toBe('interrupted');
  });

  it('gives the reason the user can act on first', () => {
    expect(summarizeFailures([])).toBeNull();
    expect(summarizeFailures(['ai_invalid_output', 'ai_overloaded'])).toBe('ai_overloaded');
    expect(summarizeFailures(['interrupted', 'ai_invalid_output'])).toBe('ai_invalid_output');
    expect(summarizeFailures(['draft_changed'])).toBe('draft_changed');
  });
});
