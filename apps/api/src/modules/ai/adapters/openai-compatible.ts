import { z } from 'zod';
import {
  AiError,
  type AiErrorKind,
  AiTextModel,
  type AiTextRequest,
  type AiTextResult,
} from '../ai-text-model.js';

export interface OpenAiCompatibleConfig {
  /** E.g. "http://localhost:11434/v1"; requests go to `{baseUrl}/chat/completions`. */
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

/** The part of a chat completion the adapter reads; anything else is ignored. */
const completionSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable() }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional(),
    })
    .nullable()
    .optional(),
});

/** What an HTTP status means for the request, by the conventions of OpenAI-compatible services. */
export function errorKindOfStatus(status: number): AiErrorKind {
  if (status === 429 || status === 503 || status === 529) {
    return 'overloaded';
  }
  if (status === 408 || status === 504) {
    return 'timeout';
  }
  return status >= 500 ? 'unavailable' : 'rejected';
}

/**
 * `POST {AI_BASE_URL}/chat/completions` with plain `fetch` (ADR-031): local servers (Ollama, LM
 * Studio, vLLM, LiteLLM) and hosted services that speak the same API. The answer is asked for as
 * JSON matching the request's schema. Nothing the service sends back beyond the envelope is read
 * into an error, and the key appears only in the `Authorization` header.
 */
export class OpenAiCompatibleTextModel extends AiTextModel {
  private readonly url: string;

  constructor(private readonly config: OpenAiCompatibleConfig) {
    super();
    this.url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  }

  async generate(request: AiTextRequest): Promise<AiTextResult> {
    const timeout = AbortSignal.timeout(this.config.timeoutMs);
    const signal = AbortSignal.any([request.signal, timeout]);
    const failure = (error: unknown): AiError => {
      if (request.signal.aborted) {
        return new AiError('aborted', 'The AI request was cancelled', { cause: error });
      }
      if (timeout.aborted) {
        return new AiError(
          'timeout',
          `The AI service did not answer within ${this.config.timeoutMs} ms`,
          { cause: error },
        );
      }
      return new AiError('unavailable', 'The AI service could not be reached', { cause: error });
    };
    let response: Response;
    try {
      response = await fetch(this.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.prompt },
          ],
          max_tokens: request.maxOutputTokens,
          response_format: {
            type: 'json_schema',
            json_schema: { name: request.schema.name, schema: request.schema.schema },
          },
          stream: false,
        }),
        signal,
      });
    } catch (error) {
      throw failure(error);
    }
    if (!response.ok) {
      // The body of an error can repeat the prompt: it is dropped, never read into the error. The
      // HTTP status is the failure; one in releasing the connection would add nothing to it.
      await response.body?.cancel().catch(() => undefined);
      throw new AiError(
        errorKindOfStatus(response.status),
        `The AI service answered HTTP ${response.status}`,
        { status: response.status },
      );
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      if (signal.aborted) {
        throw failure(error);
      }
      // A JSON syntax error quotes the text it read: no cause, so it never reaches a log.
      throw new AiError('bad_response', 'The AI service answered with a body that is not JSON');
    }
    const completion = completionSchema.safeParse(body);
    const choice = completion.data?.choices[0];
    if (!completion.success || choice === undefined || choice.message.content === null) {
      throw new AiError('bad_response', 'The AI service answered without a chat completion');
    }
    return {
      text: choice.message.content,
      usage: {
        inputTokens: completion.data.usage?.prompt_tokens ?? null,
        outputTokens: completion.data.usage?.completion_tokens ?? null,
      },
      truncated: choice.finish_reason === 'length',
    };
  }
}
