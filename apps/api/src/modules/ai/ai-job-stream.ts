import { Logger } from '@nestjs/common';
import { AI_JOB_STREAM_TYPE, type AiJobEvent } from '@plp/contracts';
import type { Response } from 'express';
import type { AiRunHandle } from './ai-job-runner.js';

/**
 * A line at least this often while the AI is quiet: proxies close a response that sends nothing
 * for a while (the admin's `/api` rewrite after 30 s), and one section can take longer.
 */
export const HEARTBEAT_MS = 10_000;

const logger = new Logger('AiJobStream');

/**
 * Starts a 200 NDJSON answer at once, before any line: `no-transform` keeps compressing proxies
 * from holding lines back, `X-Accel-Buffering` keeps nginx from buffering them.
 */
export function startNdjson(response: Response): void {
  response.status(200);
  response.setHeader('Content-Type', `${AI_JOB_STREAM_TYPE}; charset=utf-8`);
  response.setHeader('Cache-Control', 'no-store, no-transform');
  response.setHeader('X-Accel-Buffering', 'no');
  response.flushHeaders();
}

/**
 * Streams a run's progress on the response of the request that started it, as NDJSON (ADR-031):
 * `started`, each section's progress, `heartbeat`s, then `finished` with the job. No polling. A
 * client that goes away only stops the stream: the run goes on and ends its job.
 */
export function streamRun(response: Response, run: AiRunHandle, heartbeatMs = HEARTBEAT_MS): void {
  startNdjson(response);
  const open = () => !response.writableEnded && !response.destroyed;
  const write = (event: AiJobEvent) => {
    if (open()) {
      response.write(`${JSON.stringify(event)}\n`);
    }
  };
  write({ type: 'started', job: run.job });
  const unsubscribe = run.subscribe(write);
  const heartbeat = setInterval(() => {
    write({ type: 'heartbeat' });
  }, heartbeatMs);
  heartbeat.unref();
  const stop = () => {
    clearInterval(heartbeat);
    unsubscribe();
  };
  response.on('close', stop);
  run.done
    .then((job) => {
      stop();
      if (open()) {
        response.end(`${JSON.stringify({ type: 'finished', job } satisfies AiJobEvent)}\n`);
      }
    })
    .catch((error: unknown) => {
      // `done` never rejects; should it, the client still gets an end instead of a hung stream.
      logger.error({ err: error }, 'AI job stream failed');
      response.destroy();
    });
}
