import { Injectable } from '@nestjs/common';
import type { SectionInstance } from '@plp/contracts';
import { parseComposition } from '@plp/sections/schema';
import { AiError, AiTextModel, type AiTextResult } from './ai-text-model.js';
import { buildSectionPrompt, type PromptContext, withRetryFeedback } from './domain/prompts.js';
import {
  applySectionCopy,
  type CopyIssue,
  copyJsonSchema,
  copyPlanOf,
  parseSectionCopy,
  planCharacters,
} from './domain/section-copy.js';

/** Tokens counted by the service over a section's requests. */
export interface TokenCount {
  input: number;
  output: number;
}

export type SectionWriteResult =
  | { status: 'written'; section: SectionInstance; tokens: TokenCount }
  /** Two answers that the section's schema refused. */
  | { status: 'invalid'; tokens: TokenCount }
  | { status: 'error'; error: AiError; tokens: TokenCount };

/** The most an answer may hold: a long FAQ fits, a runaway answer is cut. */
const MAX_OUTPUT_TOKENS = 4096;
const OUTPUT_TOKEN_MARGIN = 300;

/** An answer the registry refused, as issues for the retry, with paths inside the section. */
function registryIssues(
  issues: readonly { path: (string | number)[]; message: string }[],
): CopyIssue[] {
  // ["sections", 0, "content", "items", 1, "title"] → "items.1.title"
  return issues.map((issue) => ({ path: issue.path.slice(3).join('.'), message: issue.message }));
}

/**
 * Writes one section with the AI (ADR-031): asks for JSON matching what the AI may write there,
 * reads the answer as untrusted input and has the registry parse the result. An answer that does
 * not fit gets one retry, told what was wrong; a failed request gets none here ("Thử lại" of the
 * screen covers it). The editor assistant (G5) writes through the same steps.
 */
@Injectable()
export class SectionWriter {
  constructor(private readonly model: AiTextModel) {}

  /**
   * `beforeRetry` runs before the retry is sent: the caller aborts `signal` there when the work is
   * no longer wanted. No request is sent once `signal` aborted.
   */
  async write(
    context: PromptContext,
    section: SectionInstance,
    signal: AbortSignal,
    beforeRetry: () => Promise<void> = () => Promise.resolve(),
  ): Promise<SectionWriteResult> {
    const plan = copyPlanOf(section);
    const first = buildSectionPrompt(context, section, plan);
    const schema = { name: `section_${section.type}`, schema: copyJsonSchema(plan) };
    const maxOutputTokens = Math.min(MAX_OUTPUT_TOKENS, OUTPUT_TOKEN_MARGIN + planCharacters(plan));
    const tokens: TokenCount = { input: 0, output: 0 };
    let prompt = first;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (attempt > 0) {
        await beforeRetry();
      }
      if (signal.aborted) {
        return {
          status: 'error',
          error: new AiError('aborted', 'The AI request was cancelled'),
          tokens,
        };
      }
      let result: AiTextResult;
      try {
        result = await this.model.generate({ ...prompt, schema, maxOutputTokens, signal });
      } catch (error) {
        if (error instanceof AiError) {
          return { status: 'error', error, tokens };
        }
        throw error;
      }
      tokens.input += result.usage.inputTokens ?? 0;
      tokens.output += result.usage.outputTokens ?? 0;
      let issues: CopyIssue[];
      if (result.truncated) {
        issues = [{ path: '', message: 'was cut off at the length limit; write shorter text' }];
      } else {
        const parsed = parseSectionCopy(plan, result.text);
        if (parsed.ok) {
          const written = applySectionCopy(section, plan, parsed.copy);
          const checked = parseComposition({ version: 1, sections: [written] });
          const [parsedSection] = checked.success ? checked.composition.sections : [];
          if (parsedSection !== undefined) {
            return { status: 'written', section: parsedSection, tokens };
          }
          issues = registryIssues(checked.issues);
        } else {
          issues = parsed.issues;
        }
      }
      prompt = withRetryFeedback(first, issues);
    }
    return { status: 'invalid', tokens };
  }
}
