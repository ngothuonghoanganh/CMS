import { Injectable, Logger } from '@nestjs/common';
import {
  type AiFailure,
  type AiSuggestionChange,
  type AiSuggestionResult,
  MAX_SECTIONS,
  type VnMonth,
} from '@plp/contracts';
import { validationFailed } from '../../shared/errors.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import { TaskLimiter } from '../../shared/task-limiter.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { PageAccessService } from '../pages/page-access.service.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { AiQuota } from './ai-quota.service.js';
import { AiError, AiTextModel, type AiTextResult } from './ai-text-model.js';
import {
  type AiSuggestionValues,
  buildSuggestionPrompt,
  changesOf,
  checkedCopy,
  planSuggestion,
  type SuggestionContext,
  type SuggestionPlan,
  type SuggestionTask,
  type SuggestionUnit,
} from './domain/assistant.js';
import { failureOfError, SECTION_CONCURRENCY, summarizeFailures } from './domain/job-rules.js';
import { withRetryFeedback } from './domain/prompts.js';
import {
  copyJsonSchema,
  type CopyIssue,
  planCharacters,
  readSectionCopy,
  type SectionCopy,
} from './domain/section-copy.js';

/** The most an answer may hold; a whole FAQ fits. */
const MAX_OUTPUT_TOKENS = 4096;
const OUTPUT_TOKEN_MARGIN = 300;

/** Runs a suggestion whose use is reserved; never rejects for the AI's sake. */
export interface SuggestionRun {
  execute(signal: AbortSignal): Promise<AiSuggestionResult>;
}

interface UnitOutcome {
  changes: AiSuggestionChange[];
  input: number;
  output: number;
}

/** A reading of an answer: the fields that passed, and why the others did not. */
interface Reading {
  copy: SectionCopy;
  issues: CopyIssue[];
}

/** The reading of two that kept more fields: a retry can do worse than the first answer. */
function better(first: Reading | null, second: Reading): Reading {
  return first !== null && first.copy.texts.size > second.copy.texts.size ? first : second;
}

/**
 * The assistant of the editor (ADR-031, board 21): `pages.edit` on the site. Suggests new text for
 * a field, a section or the page and never changes the draft; the editor applies what the user
 * accepts as one command. One use of the month is reserved before the AI is asked, and given back
 * unless at least one change came back to a client still waiting for it.
 */
@Injectable()
export class AiSuggestionsService {
  private readonly logger = new Logger(AiSuggestionsService.name);

  constructor(
    private readonly pageAccess: PageAccessService,
    private readonly quota: AiQuota,
    private readonly model: AiTextModel,
    private readonly transactions: TransactionRunner,
  ) {}

  /**
   * Everything that can be refused is checked before the use is reserved: the switch, the
   * per-user throttle, the scope's text (by the registry) and what the action writes in it.
   */
  async start(
    user: AuthenticatedUser,
    siteId: string,
    pageId: string,
    input: AiSuggestionValues,
  ): Promise<SuggestionRun> {
    const { scope, site, page } = await this.pageAccess.access(user, siteId, pageId, 'pages.edit');
    this.quota.requireEnabled();
    await this.quota.throttle(scope.userId);
    const planned = planSuggestion(input);
    if (!planned.ok) {
      throw validationFailed(planned.issues, 'Trợ lý AI chưa viết được cho phạm vi này');
    }
    const month = await this.quota.prepare(scope);
    await this.transactions.run((tx) => this.quota.reserve(scope, month, tx));
    const context: SuggestionContext = { siteName: site.name, pageTitle: page.title };
    const task: SuggestionTask = {
      action: input.action,
      tone: input.tone,
      instruction: input.instruction,
    };
    return {
      execute: (signal) =>
        this.execute({ scope, month, context, task, plan: planned.plan, pageId }, signal),
    };
  }

  private async execute(
    run: {
      scope: WorkspaceScope;
      month: VnMonth;
      context: SuggestionContext;
      task: SuggestionTask;
      plan: SuggestionPlan;
      pageId: string;
    },
    signal: AbortSignal,
  ): Promise<AiSuggestionResult> {
    const startedAt = Date.now();
    // Set once the use is kept or on its way back, so it goes back at most once.
    let settled = false;
    try {
      const limiter = new TaskLimiter({ running: SECTION_CONCURRENCY, waiting: MAX_SECTIONS });
      const outcomes = await Promise.all(
        run.plan.units.map((unit) =>
          limiter.run(() => this.writeUnit(run.context, run.task, run.plan, unit, signal)),
        ),
      );
      const changes = outcomes.flatMap((outcome) => outcome.changes);
      const written = changes.filter((change) => change.status === 'ok').length;
      // A client that went away never sees the changes: nothing was written for it.
      const kept = written > 0 && !signal.aborted;
      settled = true;
      if (!kept) {
        await this.refund(run.scope, run.month);
      }
      const failures = changes.flatMap((change): AiFailure[] =>
        change.status === 'failed' ? [change.failure] : [],
      );
      this.logger.log(
        {
          pageId: run.pageId,
          action: run.task.action,
          units: run.plan.units.length,
          written,
          failed: failures.length,
          charged: kept,
          aborted: signal.aborted,
          inputTokens: outcomes.reduce((sum, outcome) => sum + outcome.input, 0),
          outputTokens: outcomes.reduce((sum, outcome) => sum + outcome.output, 0),
          ms: Date.now() - startedAt,
        },
        'AI suggestion ended',
      );
      return {
        changes,
        charged: kept,
        failure: written > 0 ? null : summarizeFailures(failures),
        usage: await this.quota.usageOf(run.scope),
      };
    } catch (error) {
      // A defect while the AI wrote: the use goes back before the error does.
      if (!settled) {
        await this.refund(run.scope, run.month);
      }
      throw new Error('The AI suggestion failed', { cause: error });
    }
  }

  /**
   * One AI request of the suggestion and, when its answer does not fit, one retry told what was
   * wrong. Fields still unusable after it are failed ("Chưa viết được phần này"); a failed request
   * fails every field of the unit.
   */
  private async writeUnit(
    context: SuggestionContext,
    task: SuggestionTask,
    plan: SuggestionPlan,
    unit: SuggestionUnit,
    signal: AbortSignal,
  ): Promise<UnitOutcome> {
    const first = buildSuggestionPrompt(context, unit, task, plan.language);
    const schema = {
      name: unit.kind === 'seo' ? 'page_seo' : `section_${unit.section.type}`,
      schema: copyJsonSchema(unit.plan),
    };
    const maxOutputTokens = Math.min(
      MAX_OUTPUT_TOKENS,
      OUTPUT_TOKEN_MARGIN + planCharacters(unit.plan),
    );
    const tokens = { input: 0, output: 0 };
    let reading: Reading | null = null;
    let prompt = first;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let result: AiTextResult;
      try {
        result = await this.model.generate({ ...prompt, schema, maxOutputTokens, signal });
      } catch (error) {
        if (!(error instanceof AiError)) {
          throw error;
        }
        // The kind and status say what happened; an AiError never holds the prompt or answer.
        this.logger.warn(
          { err: error, target: unit.kind === 'seo' ? 'seo' : unit.section.type },
          'AI suggestion not written',
        );
        const failure = failureOfError(error.kind, signal.aborted ? 'cancelled' : null);
        return { changes: changesOf(unit, emptyCopy(), failure), ...tokens };
      }
      tokens.input += result.usage.inputTokens ?? 0;
      tokens.output += result.usage.outputTokens ?? 0;
      let next: Reading;
      if (result.truncated) {
        next = {
          copy: emptyCopy(),
          issues: [{ path: '', message: 'was cut off at the length limit; write shorter text' }],
        };
      } else {
        const read = readSectionCopy(unit.parsePlan, result.text);
        const checked = checkedCopy(unit, read.copy);
        next = {
          copy: checked.copy,
          issues: [
            ...read.issues,
            ...checked.refused.map((path) => ({ path, message: 'is not accepted by the page' })),
          ],
        };
      }
      reading = better(reading, next);
      if (next.issues.length === 0) {
        break;
      }
      prompt = withRetryFeedback(first, next.issues);
    }
    return {
      changes: changesOf(unit, reading?.copy ?? emptyCopy(), 'ai_invalid_output'),
      ...tokens,
    };
  }

  private refund(scope: WorkspaceScope, month: VnMonth): Promise<void> {
    return this.transactions.run((tx) => this.quota.refund(scope, month, tx));
  }
}

function emptyCopy(): SectionCopy {
  return { texts: new Map(), itemCounts: new Map(), flagged: [] };
}
