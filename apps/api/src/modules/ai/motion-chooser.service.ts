import { Injectable } from '@nestjs/common';
import type { AiBrief, SectionInstance } from '@plp/contracts';
import { AiError, AiTextModel, type AiTextResult } from './ai-text-model.js';
import {
  buildMotionPrompt,
  changeablePositions,
  MOTION_MAX_OUTPUT_TOKENS,
  MOTION_SCHEMA_NAME,
  type MotionChoice,
  motionJsonSchema,
  readMotionChoice,
} from './domain/motion-choice.js';
import type { TokenCount } from './section-writer.service.js';

export type MotionChooseResult =
  | { status: 'chosen'; choice: MotionChoice; tokens: TokenCount }
  /** An answer that is no motion choice, or was cut off. */
  | { status: 'invalid'; tokens: TokenCount }
  | { status: 'error'; error: AiError; tokens: TokenCount };

/**
 * "AI chọn" of a page job (ADR-032): one request for the page's motion, after its sections are
 * written, with no retry. Whatever it answers is read as untrusted input; the job keeps the style
 * it expected when nothing usable comes back.
 */
@Injectable()
export class MotionChooser {
  constructor(private readonly model: AiTextModel) {}

  async choose(
    brief: AiBrief,
    sections: readonly Pick<SectionInstance, 'id' | 'type' | 'variant'>[],
    signal: AbortSignal,
  ): Promise<MotionChooseResult> {
    const tokens: TokenCount = { input: 0, output: 0 };
    let result: AiTextResult;
    try {
      result = await this.model.generate({
        ...buildMotionPrompt(brief, sections),
        schema: {
          name: MOTION_SCHEMA_NAME,
          schema: motionJsonSchema(changeablePositions(sections)),
        },
        maxOutputTokens: MOTION_MAX_OUTPUT_TOKENS,
        signal,
      });
    } catch (error) {
      if (error instanceof AiError) {
        return { status: 'error', error, tokens };
      }
      throw error;
    }
    tokens.input += result.usage.inputTokens ?? 0;
    tokens.output += result.usage.outputTokens ?? 0;
    const choice = result.truncated ? null : readMotionChoice(result.text, sections);
    return choice === null ? { status: 'invalid', tokens } : { status: 'chosen', choice, tokens };
  }
}
