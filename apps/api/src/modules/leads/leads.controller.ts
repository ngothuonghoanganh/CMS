import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  type LeadCounts,
  type LeadDetail,
  type LeadFilters,
  leadFiltersSchema,
  type LeadListResponse,
  leadListQuerySchema,
  leadSearchRequestSchema,
  type PersonDeleteResponse,
  type PersonExportRequest,
  personExportRequestSchema,
  updateLeadContactRequestSchema,
  updateLeadRequestSchema,
} from '@plp/contracts';
import type { Response } from 'express';
import { ZodPipe } from '../../shared/zod.pipe.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { LeadExportService } from './lead-export.service.js';
import { leadFileResponse, NO_STORE } from './lead-file-response.js';
import {
  LeadInboxService,
  type LeadPageQuery,
  type UpdateLeadContactValues,
  type UpdateLeadValues,
} from './lead-inbox.service.js';
import { LeadPersonService } from './lead-person.service.js';

/** The lead inbox (board 10, ADR-018); exports and deletions are owner only (ADR-017). */
@Controller()
export class LeadsController {
  private readonly logger = new Logger(LeadsController.name);

  constructor(
    private readonly inbox: LeadInboxService,
    private readonly exports: LeadExportService,
    private readonly people: LeadPersonService,
  ) {}

  @Get('sites/:siteId/leads')
  @Header('Cache-Control', NO_STORE)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Query(new ZodPipe(leadListQuerySchema)) query: LeadPageQuery,
  ): Promise<LeadListResponse> {
    return this.inbox.list(user, siteId, query);
  }

  /** The same list narrowed by a search, which stays out of the URL (rule 10). */
  @Post('sites/:siteId/leads/search')
  @HttpCode(200)
  @Header('Cache-Control', NO_STORE)
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Body(new ZodPipe(leadSearchRequestSchema)) body: LeadPageQuery,
  ): Promise<LeadListResponse> {
    return this.inbox.list(user, siteId, body);
  }

  @Get('sites/:siteId/lead-counts')
  @Header('Cache-Control', NO_STORE)
  counts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
  ): Promise<LeadCounts> {
    return this.inbox.counts(user, siteId);
  }

  @Post('sites/:siteId/leads/export')
  @HttpCode(200)
  async exportLeads(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Body(new ZodPipe(leadFiltersSchema)) body: LeadFilters,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return leadFileResponse(
      response,
      await this.exports.exportLeads(user, siteId, body),
      this.logger,
    );
  }

  @Get('leads/:leadId')
  @Header('Cache-Control', NO_STORE)
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leadId') leadId: string,
  ): Promise<LeadDetail> {
    return this.inbox.get(user, leadId);
  }

  @Patch('leads/:leadId')
  @Header('Cache-Control', NO_STORE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leadId') leadId: string,
    @Body(new ZodPipe(updateLeadRequestSchema)) body: UpdateLeadValues,
  ): Promise<LeadDetail> {
    return this.inbox.update(user, leadId, body);
  }

  @Patch('leads/:leadId/contact')
  @Header('Cache-Control', NO_STORE)
  updateContact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leadId') leadId: string,
    @Body(new ZodPipe(updateLeadContactRequestSchema)) body: UpdateLeadContactValues,
  ): Promise<LeadDetail> {
    return this.inbox.updateContact(user, leadId, body);
  }

  @Post('leads/:leadId/notification/retry')
  @HttpCode(200)
  @Header('Cache-Control', NO_STORE)
  retryNotification(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leadId') leadId: string,
  ): Promise<LeadDetail> {
    return this.inbox.retryNotification(user, leadId);
  }

  @Post('leads/:leadId/person/export')
  @HttpCode(200)
  async exportPerson(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leadId') leadId: string,
    @Body(new ZodPipe(personExportRequestSchema)) body: PersonExportRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return leadFileResponse(
      response,
      await this.exports.exportPerson(user, leadId, body),
      this.logger,
    );
  }

  @Delete('leads/:leadId/person')
  deletePerson(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leadId') leadId: string,
  ): Promise<PersonDeleteResponse> {
    return this.people.deleteFromLead(user, leadId);
  }
}
