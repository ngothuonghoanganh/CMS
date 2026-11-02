/**
 * The port every AI provider plugs into (ADR-031). Product code asks for text that matches a JSON
 * Schema and never knows which service answers; each adapter maps its own errors to `AiError`.
 */

/** The JSON Schema subset the AI's answers use: objects of strings and arrays of objects. */
export type JsonSchema =
  | {
      type: 'object';
      properties: Readonly<Record<string, JsonSchema>>;
      required: readonly string[];
      additionalProperties: false;
      description?: string;
    }
  | {
      type: 'array';
      items: JsonSchema;
      minItems?: number;
      maxItems?: number;
      description?: string;
    }
  | { type: 'string'; minLength?: number; maxLength?: number; description?: string };

export interface AiTextRequest {
  /** What the AI is and the rules it follows. */
  system: string;
  prompt: string;
  /** The answer's JSON Schema; `name` labels it for services that ask for one. */
  schema: { name: string; schema: JsonSchema };
  maxOutputTokens: number;
  /** Cancels the request: the user cancelled, the job ran out of time or the API stops. */
  signal: AbortSignal;
}

export interface AiTextResult {
  text: string;
  /** Tokens the service counted, when it says. */
  usage: { inputTokens: number | null; outputTokens: number | null };
  /** The answer stopped at `maxOutputTokens`, so its JSON is most likely cut. */
  truncated: boolean;
}

/**
 * - `disabled`: no AI service is configured.
 * - `unavailable`: the service cannot be reached, or failed (5xx).
 * - `overloaded`: the service is busy or rate-limits us (429, 503, 529).
 * - `timeout`: no answer within `AI_TIMEOUT_MS`.
 * - `aborted`: `signal` cancelled the request.
 * - `rejected`: the service refused the request (bad key, unknown model, 4xx).
 * - `bad_response`: the answer is not the service's JSON envelope.
 */
export type AiErrorKind =
  'disabled' | 'unavailable' | 'overloaded' | 'timeout' | 'aborted' | 'rejected' | 'bad_response';

/**
 * A failed AI request. Its message never holds the prompt, the answer or the API key: an answer
 * can echo the prompt, so an error body is never read into it (prompts stay out of logs).
 */
export class AiError extends Error {
  readonly status: number | null;

  constructor(
    readonly kind: AiErrorKind,
    message: string,
    options: { status?: number; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AiError';
    this.status = options.status ?? null;
  }
}

/** The AI service of the API; the module provides the adapter `AI_PROVIDER` names. */
export abstract class AiTextModel {
  abstract generate(request: AiTextRequest): Promise<AiTextResult>;
}
