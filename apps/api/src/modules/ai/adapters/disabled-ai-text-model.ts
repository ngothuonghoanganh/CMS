import { AiError, AiTextModel, type AiTextResult } from '../ai-text-model.js';

/**
 * `AI_PROVIDER=none`: the API has no AI service. Every AI entry refuses first with 409
 * `ai_disabled`, so this answer is only a guard behind it.
 */
export class DisabledAiTextModel extends AiTextModel {
  generate(): Promise<AiTextResult> {
    return Promise.reject(
      new AiError('disabled', 'No AI service is configured (AI_PROVIDER=none)'),
    );
  }
}
