import {
  BadRequestException,
  type ArgumentMetadata,
  type PipeTransform,
} from '@nestjs/common';
import type { ZodType } from 'zod';

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
        .join('; ');
      const hasPayloadIssue = result.error.issues.some(
        (issue) => issue.path[0] === 'payload' || issue.path[0] === 'root',
      );
      const code = hasPayloadIssue
        ? result.error.issues.some((issue) =>
            issue.message.includes('PAGE_PAYLOAD_TOO_LARGE'),
          )
          ? 'PAGE_PAYLOAD_TOO_LARGE'
          : result.error.issues.some((issue) => issue.message.includes('PAGE_PAYLOAD_'))
            ? 'PAGE_PAYLOAD_LIMIT_EXCEEDED'
            : 'INVALID_PAGE_PAYLOAD'
        : 'VALIDATION_ERROR';
      throw new BadRequestException({ code, message });
    }

    return result.data;
  }
}
