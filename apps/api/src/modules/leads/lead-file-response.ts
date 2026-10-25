import { type Logger, StreamableFile } from '@nestjs/common';
import { EXPORT_TRUNCATED_HEADER, type Problem } from '@plp/contracts';
import type { Response } from 'express';
import type { LeadFile } from './lead-export.service.js';

/** Personal data (rule 10): no browser or proxy keeps a copy of a lead response. */
export const NO_STORE = 'no-store';

const EXPORT_FAILED: Problem = {
  type: 'about:blank',
  title: 'Không xuất được dữ liệu, hãy thử lại',
  status: 500,
  code: 'internal',
};

/** Sends an export of leads as a download that no cache keeps. */
export function leadFileResponse(
  response: Response,
  file: LeadFile,
  logger: Logger,
): StreamableFile {
  response.setHeader('Cache-Control', NO_STORE);
  response.setHeader(EXPORT_TRUNCATED_HEADER, String(file.truncated));
  const options = {
    type: file.contentType,
    disposition: `attachment; filename="${file.filename}"`,
  };
  const streamable =
    typeof file.body === 'string'
      ? new StreamableFile(Buffer.from(file.body, 'utf8'), options)
      : new StreamableFile(file.body, options);
  return streamable.setErrorHandler((error) => {
    logger.error({ err: error }, 'Lead export failed while streaming');
    if (response.destroyed) {
      return;
    }
    if (response.headersSent) {
      // Ending normally would deliver a file that looks complete but misses rows.
      response.destroy(error);
      return;
    }
    response.removeHeader('Content-Disposition');
    response.status(500).type('application/problem+json').send(JSON.stringify(EXPORT_FAILED));
  });
}
