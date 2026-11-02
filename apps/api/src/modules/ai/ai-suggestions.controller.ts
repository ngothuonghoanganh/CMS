import { Body, Controller, Param, Post, Res } from '@nestjs/common';
import { aiSuggestionRequestSchema } from '@plp/contracts';
import type { Response } from 'express';
import { ZodPipe } from '../../shared/zod.pipe.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { abortOnClientGone, streamSuggestion } from './ai-suggestion-stream.js';
import { AiSuggestionsService } from './ai-suggestions.service.js';
import type { AiSuggestionValues } from './domain/assistant.js';

/** The assistant of the editor (ADR-031, board 21); `pages.edit` on the site. */
@Controller()
export class AiSuggestionsController {
  constructor(private readonly suggestions: AiSuggestionsService) {}

  /** Refusals are problem responses; once the stream starts, the result is its last line. */
  @Post('sites/:siteId/pages/:pageId/ai/suggestions')
  async suggest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('pageId') pageId: string,
    @Body(new ZodPipe(aiSuggestionRequestSchema)) body: AiSuggestionValues,
    @Res() response: Response,
  ): Promise<void> {
    const signal = abortOnClientGone(response);
    streamSuggestion(response, await this.suggestions.start(user, siteId, pageId, body), signal);
  }
}
