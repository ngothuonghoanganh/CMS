import type { Env } from '../../../config/env.js';
import type { AiTextModel } from '../ai-text-model.js';
import { DisabledAiTextModel } from './disabled-ai-text-model.js';
import { FakeAiTextModel } from './fake-ai-text-model.js';
import { OpenAiCompatibleTextModel } from './openai-compatible.js';

/** The adapter `AI_PROVIDER` names; `parseEnv` has checked what it needs. */
export function createAiTextModel(
  env: Pick<Env, 'AI_PROVIDER' | 'AI_BASE_URL' | 'AI_API_KEY' | 'AI_MODEL' | 'AI_TIMEOUT_MS'>,
): AiTextModel {
  switch (env.AI_PROVIDER) {
    case 'none':
      return new DisabledAiTextModel();
    case 'fake':
      return new FakeAiTextModel();
    case 'openai-compatible': {
      const { AI_BASE_URL: baseUrl, AI_API_KEY: apiKey, AI_MODEL: model } = env;
      if (baseUrl === undefined || apiKey === undefined || model === undefined) {
        throw new Error('AI_PROVIDER=openai-compatible needs AI_BASE_URL, AI_API_KEY and AI_MODEL');
      }
      return new OpenAiCompatibleTextModel({
        baseUrl,
        apiKey,
        model,
        timeoutMs: env.AI_TIMEOUT_MS,
      });
    }
  }
}
