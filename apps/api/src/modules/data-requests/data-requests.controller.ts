import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Logger,
  Param,
  Post,
  Query,
  Res,
  type StreamableFile,
} from '@nestjs/common';
import {
  createDataRequestRequestSchema,
  type CursorQuery,
  type DataRequestDetail,
  type DataRequestListResponse,
  dataRequestListQuerySchema,
  type PersonExportRequest,
  personExportRequestSchema,
} from '@plp/contracts';
import type { Response } from 'express';
import { ZodPipe } from '../../shared/zod.pipe.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { leadFileResponse, NO_STORE } from '../leads/lead-file-response.js';
import { type CreateDataRequestValues, DataRequestsService } from './data-requests.service.js';

/** Requests from people who sent a form (board 12, ADR-017): owner only. */
@Controller()
export class DataRequestsController {
  private readonly logger = new Logger(DataRequestsController.name);

  constructor(private readonly requests: DataRequestsService) {}

  @Get('sites/:siteId/data-requests')
  @Header('Cache-Control', NO_STORE)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Query(new ZodPipe(dataRequestListQuerySchema)) query: CursorQuery,
  ): Promise<DataRequestListResponse> {
    return this.requests.list(user, siteId, query);
  }

  @Post('sites/:siteId/data-requests')
  @Header('Cache-Control', NO_STORE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Body(new ZodPipe(createDataRequestRequestSchema)) body: CreateDataRequestValues,
  ): Promise<DataRequestDetail> {
    return this.requests.create(user, siteId, body);
  }

  @Get('data-requests/:requestId')
  @Header('Cache-Control', NO_STORE)
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
  ): Promise<DataRequestDetail> {
    return this.requests.get(user, requestId);
  }

  @Post('data-requests/:requestId/respond')
  @HttpCode(200)
  @Header('Cache-Control', NO_STORE)
  respond(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
  ): Promise<DataRequestDetail> {
    return this.requests.respond(user, requestId);
  }

  @Post('data-requests/:requestId/export')
  @HttpCode(200)
  async exportFile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
    @Body(new ZodPipe(personExportRequestSchema)) body: PersonExportRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return leadFileResponse(
      response,
      await this.requests.exportFile(user, requestId, body),
      this.logger,
    );
  }

  @Post('data-requests/:requestId/complete')
  @HttpCode(200)
  @Header('Cache-Control', NO_STORE)
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
  ): Promise<DataRequestDetail> {
    return this.requests.complete(user, requestId);
  }
}
