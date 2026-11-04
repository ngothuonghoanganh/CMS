import { Body, Controller, Get, Header, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  type ContactBulkResponse,
  type ContactBulkValues,
  contactBulkRequestSchema,
  type ContactListQuery,
  contactListQuerySchema,
  type ContactListResponse,
  type ContactOptionsResponse,
  contactSearchRequestSchema,
  type CreateContactResponse,
  type CreateContactValues,
  createContactRequestSchema,
  type MergeContactsRequest,
  mergeContactsRequestSchema,
  type MergeContactsResponse,
  type MergeSuggestionListResponse,
} from '@plp/contracts';
import { ZodPipe } from '../../shared/zod.pipe.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { NO_STORE } from '../leads/lead-file-response.js';
import { ContactsService } from './contacts.service.js';

/** The customers of a site (board 22, ADR-033); personal data, never cached. */
@Controller()
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get('sites/:siteId/contacts')
  @Header('Cache-Control', NO_STORE)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Query(new ZodPipe(contactListQuerySchema)) query: ContactListQuery,
  ): Promise<ContactListResponse> {
    return this.contacts.list(user, siteId, query);
  }

  /** The same list narrowed by a search, which stays out of the URL (rule 10). */
  @Post('sites/:siteId/contacts/search')
  @HttpCode(200)
  @Header('Cache-Control', NO_STORE)
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Body(new ZodPipe(contactSearchRequestSchema)) body: ContactListQuery,
  ): Promise<ContactListResponse> {
    return this.contacts.list(user, siteId, body);
  }

  @Get('sites/:siteId/contacts/options')
  @Header('Cache-Control', NO_STORE)
  options(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
  ): Promise<ContactOptionsResponse> {
    return this.contacts.options(user, siteId);
  }

  /** 200 either way: a new profile, or the one that already has the number. */
  @Post('sites/:siteId/contacts')
  @HttpCode(200)
  @Header('Cache-Control', NO_STORE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Body(new ZodPipe(createContactRequestSchema)) body: CreateContactValues,
  ): Promise<CreateContactResponse> {
    return this.contacts.create(user, siteId, body);
  }

  @Post('sites/:siteId/contacts/bulk')
  @HttpCode(200)
  bulk(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Body(new ZodPipe(contactBulkRequestSchema)) body: ContactBulkValues,
  ): Promise<ContactBulkResponse> {
    return this.contacts.bulk(user, siteId, body);
  }

  @Get('sites/:siteId/contact-suggestions')
  @Header('Cache-Control', NO_STORE)
  suggestions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
  ): Promise<MergeSuggestionListResponse> {
    return this.contacts.suggestionList(user, siteId);
  }

  @Post('sites/:siteId/contact-suggestions/:suggestionId/merge')
  @HttpCode(200)
  @Header('Cache-Control', NO_STORE)
  merge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('suggestionId') suggestionId: string,
    @Body(new ZodPipe(mergeContactsRequestSchema)) body: MergeContactsRequest,
  ): Promise<MergeContactsResponse> {
    return this.contacts.merge(user, siteId, suggestionId, body);
  }

  @Post('sites/:siteId/contact-suggestions/:suggestionId/dismiss')
  @HttpCode(204)
  dismiss(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('suggestionId') suggestionId: string,
  ): Promise<void> {
    return this.contacts.dismiss(user, siteId, suggestionId);
  }
}
