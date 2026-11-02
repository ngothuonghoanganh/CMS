import { Logger } from '@nestjs/common';
import type { AiSuggestionEvent } from '@plp/contracts';
import type { Response } from 'express';
import { HEARTBEAT_MS, startNdjson } from './ai-job-stream.js';
import type { SuggestionRun } from './ai-suggestions.service.js';

const logger = new Logger('AiSuggestionStream');

/**
 * A signal that aborts when the client goes away before its answer ended: "Hủy" in the editor
 * closes the request (ADR-031). Listened to from the start of the request, so a client gone while
 * the use was being reserved is noticed too. A response that ended closes without aborting.
 */
export function abortOnClientGone(response: Response): AbortSignal {
  const controller = new AbortController();
  response.on('close', () => {
    if (!response.writableEnded) {
      controller.abort();
    }
  });
  return controller.signal;
}

/**
 * Ends the response with `chunk`. True once it was handed on whole; false when the client went
 * away first, before or while it was written.
 */
function endWith(response: Response, chunk: string): Promise<boolean> {
  if (response.writableEnded || response.destroyed) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    // Emitted once the response finished, or once its connection went before that.
    response.once('close', () => {
      resolve(response.writableFinished);
    });
    response.end(chunk);
  });
}

/**
 * Streams a suggestion on the response of its request, as NDJSON: `heartbeat`s while the AI
 * writes, since proxies close quiet connections and a page's sections take minutes, then the
 * `result`. The use is charged only once the result line went out whole: a client gone before
 * that gets its use back (ADR-031). A defect ends the response without a result, which the client
 * reports as a failure.
 */
export function streamSuggestion(
  response: Response,
  run: SuggestionRun,
  signal: AbortSignal,
  heartbeatMs = HEARTBEAT_MS,
): void {
  startNdjson(response);
  const open = () => !response.writableEnded && !response.destroyed;
  const line = (event: AiSuggestionEvent) => `${JSON.stringify(event)}\n`;
  const heartbeat = setInterval(() => {
    if (open()) {
      response.write(line({ type: 'heartbeat' }));
    }
  }, heartbeatMs);
  heartbeat.unref();
  run
    .execute(signal)
    .then(async ({ result, giveBack }) => {
      if ((await endWith(response, line({ type: 'result', result }))) || giveBack === null) {
        return;
      }
      await giveBack();
      logger.log('AI suggestion not delivered; its use was given back');
    })
    .catch((error: unknown) => {
      logger.error({ err: error }, 'AI suggestion stream failed');
      response.destroy();
    })
    .finally(() => {
      clearInterval(heartbeat);
    });
}
