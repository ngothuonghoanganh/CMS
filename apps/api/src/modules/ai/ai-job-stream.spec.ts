import { type AiJob, type AiJobEvent, aiJobEventSchema } from '@plp/contracts';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { AiRunHandle } from './ai-job-runner.js';
import { streamRun } from './ai-job-stream.js';

const JOB: AiJob = {
  id: '64b000000000000000000001',
  status: 'running',
  sections: [{ id: 'abcdefgh1234', type: 'hero', variant: 'split', status: 'queued' }],
  pageId: null,
  retriesLeft: 2,
  failure: null,
};

/** A run the test drives: it emits sections and ends when told. */
function controlledRun() {
  const listeners = new Set<(event: AiJobEvent) => void>();
  const history: AiJobEvent[] = [];
  let finish: (job: AiJob) => void = () => undefined;
  const handle: AiRunHandle = {
    job: JOB,
    subscribe(listener) {
      for (const event of history) {
        listener(event);
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    done: new Promise((resolve) => {
      finish = resolve;
    }),
  };
  return {
    handle,
    emit(event: AiJobEvent) {
      history.push(event);
      for (const listener of listeners) {
        listener(event);
      }
    },
    finish: (job: AiJob) => {
      finish(job);
    },
    listeners,
  };
}

function lines(text: string): AiJobEvent[] {
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => aiJobEventSchema.parse(JSON.parse(line)));
}

describe('the NDJSON stream of a run (ADR-031)', () => {
  it('writes started, the progress so far and to come, heartbeats, then finished', async () => {
    const run = controlledRun();
    // Progress before the request listens is replayed, so nothing is missed.
    run.emit({ type: 'section', sectionId: 'abcdefgh1234', status: 'writing' });
    const app = express().post('/', (_request, response) => {
      streamRun(response, run.handle, 20);
      setTimeout(() => {
        run.emit({ type: 'section', sectionId: 'abcdefgh1234', status: 'done' });
        run.finish({
          ...JOB,
          status: 'done',
          pageId: '64b000000000000000000002',
          sections: [{ ...JOB.sections[0], status: 'done' } as AiJob['sections'][number]],
        });
      }, 70);
    });
    const response = await request(app).post('/').buffer(true).expect(200);
    expect(response.headers['content-type']).toBe('application/x-ndjson; charset=utf-8');
    expect(response.headers['cache-control']).toBe('no-store, no-transform');
    expect(response.headers['x-accel-buffering']).toBe('no');
    const events = lines(response.text);
    expect(events[0]).toEqual({ type: 'started', job: JOB });
    expect(events[1]).toEqual({ type: 'section', sectionId: 'abcdefgh1234', status: 'writing' });
    expect(events.filter((event) => event.type === 'heartbeat').length).toBeGreaterThan(0);
    expect(events.at(-2)).toEqual({ type: 'section', sectionId: 'abcdefgh1234', status: 'done' });
    expect(events.at(-1)).toMatchObject({ type: 'finished', job: { status: 'done' } });
    // The stream let go of the run.
    expect(run.listeners.size).toBe(0);
  });

  it('stops listening when the client goes away, and the run goes on', async () => {
    const run = controlledRun();
    let closed: () => void = () => undefined;
    const gone = new Promise<void>((resolve) => {
      closed = resolve;
    });
    const app = express().post('/', (_request, response) => {
      response.on('close', closed);
      streamRun(response, run.handle, 1_000);
    });
    await request(app)
      .post('/')
      .buffer(true)
      .parse((response, done) => {
        const incoming = response as unknown as NodeJS.ReadableStream & { destroy: () => void };
        incoming.once('data', () => {
          done(null, null);
          incoming.destroy();
        });
      });
    await gone;
    expect(run.listeners.size).toBe(0);
    // Ending later writes nothing to a closed response, and throws nothing.
    run.finish({ ...JOB, status: 'done' });
    await run.handle.done;
  });
});
