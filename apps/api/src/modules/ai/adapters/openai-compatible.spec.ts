import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AiError, type AiTextRequest } from '../ai-text-model.js';
import { OpenAiCompatibleTextModel } from './openai-compatible.js';

const API_KEY = 'sk-local-khong-bao-gio-lo-ra';

interface Received {
  method: string;
  url: string;
  headers: IncomingMessage['headers'];
  body: unknown;
}

type Handler = (request: Received, response: ServerResponse) => void;

/** A local stand-in for an OpenAI-compatible service; each test says how it answers. */
let server: Server;
let baseUrl: string;
let handler: Handler;
const received: Received[] = [];

beforeAll(async () => {
  server = createServer((request, response) => {
    let text = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      text += chunk;
    });
    request.on('end', () => {
      const entry: Received = {
        method: request.method ?? '',
        url: request.url ?? '',
        headers: request.headers,
        body: text === '' ? null : JSON.parse(text),
      };
      received.push(entry);
      handler(entry, response);
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/`;
});

afterEach(() => {
  received.length = 0;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
});

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

function completion(content: string, finishReason = 'stop') {
  return {
    id: 'chatcmpl-1',
    object: 'chat.completion',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finishReason }],
    usage: { prompt_tokens: 50, completion_tokens: 48, total_tokens: 98 },
  };
}

function model(timeoutMs = 2_000): OpenAiCompatibleTextModel {
  return new OpenAiCompatibleTextModel({
    baseUrl,
    apiKey: API_KEY,
    model: 'qwen3:4b-instruct',
    timeoutMs,
  });
}

function request(signal: AbortSignal = new AbortController().signal): AiTextRequest {
  return {
    system: 'You write copy.',
    prompt: 'Product or service: Niềng răng',
    schema: {
      name: 'section_hero',
      schema: {
        type: 'object',
        properties: { heading: { type: 'string', maxLength: 80 } },
        required: ['heading'],
        additionalProperties: false,
      },
    },
    maxOutputTokens: 600,
    signal,
  };
}

async function failure(promise: Promise<unknown>): Promise<AiError> {
  const error: unknown = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  if (!(error instanceof AiError)) {
    throw new Error(`Expected an AiError, got ${String(error)}`);
  }
  // Nothing of the key, the prompt or the answer reaches an error.
  for (const secret of [API_KEY, 'Niềng răng', 'echo']) {
    expect(`${error.message} ${String(error.stack)}`).not.toContain(secret);
  }
  return error;
}

describe('the openai-compatible adapter (ADR-031)', () => {
  it('posts the chat completion with the key, the model and the JSON schema', async () => {
    handler = (_request, response) => {
      json(response, 200, completion('{"heading":"Niềng răng trong suốt"}'));
    };
    const result = await model().generate(request());
    expect(result).toEqual({
      text: '{"heading":"Niềng răng trong suốt"}',
      usage: { inputTokens: 50, outputTokens: 48 },
      truncated: false,
    });
    expect(received).toHaveLength(1);
    const [sent] = received;
    expect(sent?.method).toBe('POST');
    // The trailing slash of the base URL does not double.
    expect(sent?.url).toBe('/v1/chat/completions');
    expect(sent?.headers.authorization).toBe(`Bearer ${API_KEY}`);
    expect(sent?.headers['content-type']).toBe('application/json');
    expect(sent?.body).toEqual({
      model: 'qwen3:4b-instruct',
      messages: [
        { role: 'system', content: 'You write copy.' },
        { role: 'user', content: 'Product or service: Niềng răng' },
      ],
      max_tokens: 600,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'section_hero', schema: request().schema.schema },
      },
      stream: false,
    });
  });

  it('says when the answer stopped at the token limit', async () => {
    handler = (_request, response) => {
      json(response, 200, completion('{"heading":"Niềng', 'length'));
    };
    expect((await model().generate(request())).truncated).toBe(true);
  });

  it.each([
    [429, 'overloaded'],
    [503, 'overloaded'],
    [529, 'overloaded'],
    [504, 'timeout'],
    [500, 'unavailable'],
    [401, 'rejected'],
    [404, 'rejected'],
    [400, 'rejected'],
  ] as const)('maps HTTP %i to %s, without reading the body', async (status, kind) => {
    handler = (_request, response) => {
      json(response, status, { error: { message: 'echo: Product or service: Niềng răng' } });
    };
    const error = await failure(model().generate(request()));
    expect(error.kind).toBe(kind);
    expect(error.status).toBe(status);
  });

  it('refuses a body that is not a chat completion', async () => {
    handler = (_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.end('echo Niềng răng, not JSON');
    };
    expect((await failure(model().generate(request()))).kind).toBe('bad_response');
    handler = (_request, response) => {
      json(response, 200, { choices: [] });
    };
    expect((await failure(model().generate(request()))).kind).toBe('bad_response');
  });

  it('times out a service that does not answer in time', async () => {
    handler = () => {
      // Never answers.
    };
    const error = await failure(model(150).generate(request()));
    expect(error.kind).toBe('timeout');
    expect(error.message).toBe('The AI service did not answer within 150 ms');
  });

  it('stops when the run cancels the request', async () => {
    handler = () => {
      // Never answers; the caller gives up.
    };
    const controller = new AbortController();
    const pending = model().generate(request(controller.signal));
    setTimeout(() => {
      controller.abort('cancelled');
    }, 50);
    expect((await failure(pending)).kind).toBe('aborted');
  });

  it('reports a service it cannot reach as unavailable', async () => {
    const unreachable = new OpenAiCompatibleTextModel({
      // Nothing listens on port 9 of this machine (discard).
      baseUrl: 'http://127.0.0.1:9/v1',
      apiKey: API_KEY,
      model: 'qwen3:4b-instruct',
      timeoutMs: 2_000,
    });
    expect((await failure(unreachable.generate(request()))).kind).toBe('unavailable');
  });
});
