import {
  type AiJob,
  type AiJobEvent,
  aiJobEventSchema,
  type AiPageJobRequest,
  type AiScopeSection,
  aiSuggestionEventSchema,
  type AiSuggestionRequest,
  type AiSuggestionResult,
  type AiStructureItem,
  type SectionInstance,
} from '@plp/contracts';
import { aiWritablePaths, getAtPath, goalOutline } from '@plp/sections/schema';
import type { Response } from 'supertest';
import { expect } from 'vitest';
import { FakeAiTextModel } from '../src/modules/ai/adapters/fake-ai-text-model.js';
import { AiClock } from '../src/modules/ai/ai-quota.service.js';
import { AiError, AiTextModel } from '../src/modules/ai/ai-text-model.js';
import type { TestApp } from './app.js';
import type { TestClient } from './client.js';
import { uniqueSlug } from './pages.js';

/** The brief of board 20, without anything personal. */
export const AI_BRIEF = {
  product: 'Niềng răng trong suốt Invisalign',
  audience: 'Người đi làm 22–35 tuổi ở TP.HCM, ngại mắc cài kim loại',
  goal: 'lead',
  differentiators: 'Bác sĩ nhiều năm kinh nghiệm chỉnh nha. Chụp phim 3D miễn phí.',
  tone: 'friendly',
  language: 'vi',
} as const;

/** The structure the screen proposes for a goal: its blueprint's outline. */
export function outlineStructure(
  goal: AiPageJobRequest['brief']['goal'] = 'lead',
): AiStructureItem[] {
  return goalOutline(goal).map(({ type, variant }) => ({ type, variant }));
}

export function aiJobBody(overrides: Partial<AiPageJobRequest> = {}): AiPageJobRequest {
  return {
    title: 'Niềng răng trong suốt',
    slug: uniqueSlug('ai'),
    brief: AI_BRIEF,
    structure: outlineStructure(),
    ...overrides,
  };
}

/** Every line of an NDJSON body, each parsed by the contract. */
export function streamEvents(response: Response): AiJobEvent[] {
  const text = response.text;
  expect(text.endsWith('\n')).toBe(true);
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => aiJobEventSchema.parse(JSON.parse(line)));
}

/** The job of the stream's last line. */
export function finishedJob(events: readonly AiJobEvent[]): AiJob {
  const last = events.at(-1);
  if (last?.type !== 'finished') {
    throw new Error(`The stream did not finish: ${JSON.stringify(last)}`);
  }
  return last.job;
}

/**
 * Starts a job and reads its whole stream as `text`; a refusal keeps its problem as `body`.
 * Superagent only collects a type it does not know (NDJSON) when told to.
 */
export function postAiJob(client: TestClient, siteId: string, body: AiPageJobRequest) {
  return client.post(`/sites/${siteId}/ai/page-jobs`, body).buffer(true);
}

export function postAiRetry(client: TestClient, siteId: string, jobId: string) {
  return client.post(`/sites/${siteId}/ai/page-jobs/${jobId}/retry`).buffer(true);
}

/** Starts a job that the test expects to stream to its end. */
export async function runAiJob(
  client: TestClient,
  siteId: string,
  body: AiPageJobRequest = aiJobBody(),
): Promise<{ events: AiJobEvent[]; job: AiJob }> {
  const response = await postAiJob(client, siteId, body).expect(200);
  const events = streamEvents(response);
  return { events, job: finishedJob(events) };
}

/** What the editor sends of a section for the assistant: the text the AI may write there. */
export function scopeTextOf(section: SectionInstance): AiScopeSection {
  return {
    id: section.id,
    type: section.type,
    variant: section.variant,
    texts: Object.fromEntries(
      aiWritablePaths(section).map((path) => {
        const value = getAtPath(section.content, path);
        return [path, typeof value === 'string' ? value : ''];
      }),
    ),
  };
}

/** Asks the assistant; a refusal keeps its problem as `body`, the stream is read as `text`. */
export function postSuggestion(
  client: TestClient,
  siteId: string,
  pageId: string,
  body: AiSuggestionRequest,
) {
  return client.post(`/sites/${siteId}/pages/${pageId}/ai/suggestions`, body).buffer(true);
}

/** The result line that ends a suggestion's stream, after its heartbeats. */
export function suggestionResultOf(response: Response): AiSuggestionResult {
  const lines = response.text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => aiSuggestionEventSchema.parse(JSON.parse(line)));
  const last = lines.at(-1);
  if (last?.type !== 'result') {
    throw new Error(`The suggestion did not end with its result: ${response.text}`);
  }
  return last.result;
}

/** Asks the assistant and reads its result. */
export async function suggest(
  client: TestClient,
  siteId: string,
  pageId: string,
  body: AiSuggestionRequest,
): Promise<AiSuggestionResult> {
  return suggestionResultOf(await postSuggestion(client, siteId, pageId, body).expect(200));
}

/** The fake AI of an app started with `AI_PROVIDER=fake`. */
export function fakeAi(t: TestApp): FakeAiTextModel {
  const model = t.app.get(AiTextModel);
  if (!(model instanceof FakeAiTextModel)) {
    throw new Error('The app does not run the fake AI (AI_PROVIDER=fake)');
  }
  return model;
}

/** A clock a test moves, for the month the quota counts in. */
export class TestClock extends AiClock {
  at: Date | null = null;

  override now(): Date {
    return this.at ?? new Date();
  }
}

/** Something a fake answer waits for, until the test opens it. */
export class Gate {
  private release: () => void = () => undefined;
  readonly opened = new Promise<void>((resolve) => {
    this.release = resolve;
  });

  open(): void {
    this.release();
  }
}

/** Fails as an adapter does when `signal` aborts: a slow service the run gives up on. */
export function untilAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => {
      reject(new AiError('aborted', 'The AI request was cancelled'));
    });
  });
}
