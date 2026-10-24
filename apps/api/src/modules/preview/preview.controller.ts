import { Body, Controller, Param, Post } from '@nestjs/common';
import {
  type CreatePreviewLinkRequest,
  createPreviewLinkRequestSchema,
  type PreviewLinkResponse,
} from '@plp/contracts';
import { ZodPipe } from '../../shared/zod.pipe.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { PreviewService } from './preview.service.js';

@Controller()
export class PreviewController {
  constructor(private readonly preview: PreviewService) {}

  @Post('pages/:pageId/preview-links')
  createLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pageId') pageId: string,
    @Body(new ZodPipe(createPreviewLinkRequestSchema)) body: CreatePreviewLinkRequest,
  ): Promise<PreviewLinkResponse> {
    return this.preview.createLink(user, pageId, body);
  }
}
