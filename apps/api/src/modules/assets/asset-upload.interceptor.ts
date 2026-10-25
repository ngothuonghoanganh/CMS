import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MAX_ASSET_BYTES } from '@plp/contracts';
import type { Observable } from 'rxjs';
import { AppError } from '../../shared/errors.js';

export const ASSET_TOO_LARGE_MESSAGE = 'Ảnh tối đa 10 MB';

/**
 * Reads the single `file` part of the upload into memory (multer's default storage) and stops at
 * `MAX_ASSET_BYTES`. Multer's text fields become the request body.
 */
const SingleImageInterceptor = FileInterceptor('file', {
  limits: { fileSize: MAX_ASSET_BYTES, files: 1, fields: 10, fieldSize: 4096 },
});

/** `FileInterceptor('file')` whose size-limit error speaks the product's language (413). */
@Injectable()
export class AssetUploadInterceptor implements NestInterceptor {
  private readonly multer: NestInterceptor = new SingleImageInterceptor();

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    try {
      return await this.multer.intercept(context, next);
    } catch (error) {
      if (error instanceof PayloadTooLargeException) {
        throw new AppError(413, 'payload_too_large', ASSET_TOO_LARGE_MESSAGE, {
          issues: [{ path: ['file'], code: 'payload_too_large', message: ASSET_TOO_LARGE_MESSAGE }],
          cause: error,
        });
      }
      throw error;
    }
  }
}
