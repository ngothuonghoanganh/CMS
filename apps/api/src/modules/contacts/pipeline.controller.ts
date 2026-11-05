import { Body, Controller, Get, Header, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  type BulkCreateOpportunitiesRequest,
  bulkCreateOpportunitiesRequestSchema,
  type CreateOpportunityRequest,
  createOpportunityRequestSchema,
  moveOpportunityRequestSchema,
  type MoveOpportunityValues,
  type Opportunity,
  type PipelineQuery,
  pipelineQuerySchema,
  type PipelineResponse,
  type UpdateOpportunityRequest,
  updateOpportunityRequestSchema,
} from '@plp/contracts';
import { ZodPipe } from '../../shared/zod.pipe.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { NO_STORE } from '../leads/lead-file-response.js';
import { PipelineService } from './pipeline.service.js';

/** The pipeline (board 24, ADR-033); personal data, never cached. */
@Controller()
export class PipelineController {
  constructor(private readonly pipeline: PipelineService) {}

  @Get('sites/:siteId/pipeline')
  @Header('Cache-Control', NO_STORE)
  board(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Query(new ZodPipe(pipelineQuerySchema)) query: PipelineQuery,
  ): Promise<PipelineResponse> {
    return this.pipeline.board(user, siteId, query);
  }

  @Post('sites/:siteId/opportunities')
  @Header('Cache-Control', NO_STORE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Body(new ZodPipe(createOpportunityRequestSchema)) body: CreateOpportunityRequest,
  ): Promise<Opportunity> {
    return this.pipeline.create(user, siteId, body);
  }

  @Post('sites/:siteId/opportunities/bulk')
  @HttpCode(200)
  bulkCreate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Body(new ZodPipe(bulkCreateOpportunitiesRequestSchema)) body: BulkCreateOpportunitiesRequest,
  ): Promise<{ created: number }> {
    return this.pipeline.bulkCreate(user, siteId, body);
  }

  @Patch('sites/:siteId/opportunities/:opportunityId')
  @Header('Cache-Control', NO_STORE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('opportunityId') opportunityId: string,
    @Body(new ZodPipe(updateOpportunityRequestSchema)) body: UpdateOpportunityRequest,
  ): Promise<Opportunity> {
    return this.pipeline.update(user, siteId, opportunityId, body);
  }

  @Post('sites/:siteId/opportunities/:opportunityId/stage')
  @HttpCode(200)
  @Header('Cache-Control', NO_STORE)
  move(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('opportunityId') opportunityId: string,
    @Body(new ZodPipe(moveOpportunityRequestSchema)) body: MoveOpportunityValues,
  ): Promise<Opportunity> {
    return this.pipeline.move(user, siteId, opportunityId, body);
  }
}
