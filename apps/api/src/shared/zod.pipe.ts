import type { PipeTransform } from '@nestjs/common';
import type { ProblemIssue } from '@plp/contracts';
import type { z } from 'zod';
import { validationFailed } from './errors.js';

export function toProblemIssues(error: z.ZodError): ProblemIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map((part) => (typeof part === 'symbol' ? String(part) : part)),
    code: issue.code,
    message: issue.message,
  }));
}

/** Validates a body, query or params object with a contract schema: `@Body(new ZodPipe(schema))`. */
export class ZodPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw validationFailed(toProblemIssues(result.error));
    }
    return result.data;
  }
}
