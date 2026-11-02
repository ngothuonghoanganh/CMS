import { Body, Controller, Get, HttpCode, Param, Post, Res } from '@nestjs/common';
import { type AiJob, aiPageJobRequestSchema, type AiUsage } from '@plp/contracts';
import type { Response } from 'express';
import { ZodPipe } from '../../shared/zod.pipe.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { streamRun } from './ai-job-stream.js';
import { type AiPageJobValues, AiPageJobsService } from './ai-page-jobs.service.js';

/** Creating a page with AI (ADR-031, board 20); `pages.edit` on the site. */
@Controller()
export class AiController {
  constructor(private readonly jobs: AiPageJobsService) {}

  @Get('sites/:siteId/ai/usage')
  usage(@CurrentUser() user: AuthenticatedUser, @Param('siteId') siteId: string): Promise<AiUsage> {
    return this.jobs.usage(user, siteId);
  }

  /** Refusals are problem responses; once the stream starts, everything is a line of it. */
  @Post('sites/:siteId/ai/page-jobs')
  async start(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Body(new ZodPipe(aiPageJobRequestSchema)) body: AiPageJobValues,
    @Res() response: Response,
  ): Promise<void> {
    streamRun(response, await this.jobs.start(user, siteId, body));
  }

  @Get('sites/:siteId/ai/page-jobs/:jobId')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('jobId') jobId: string,
  ): Promise<AiJob> {
    return this.jobs.get(user, siteId, jobId);
  }

  @Post('sites/:siteId/ai/page-jobs/:jobId/retry')
  async retry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('jobId') jobId: string,
    @Res() response: Response,
  ): Promise<void> {
    streamRun(response, await this.jobs.retry(user, siteId, jobId));
  }

  @Post('sites/:siteId/ai/page-jobs/:jobId/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('jobId') jobId: string,
  ): Promise<AiJob> {
    return this.jobs.cancel(user, siteId, jobId);
  }
}
