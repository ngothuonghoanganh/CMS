import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Res,
  type StreamableFile,
} from '@nestjs/common';
import {
  type ContactDeletionPreview,
  type ContactMeeting,
  type ContactProfile,
  type ContactProfileResponse,
  type ContactTask,
  type CreateMeetingRequest,
  createMeetingRequestSchema,
  type CreateNoteRequest,
  createNoteRequestSchema,
  type CreateTaskRequest,
  createTaskRequestSchema,
  type DeleteContactPersonRequest,
  deleteContactPersonRequestSchema,
  type DeleteContactPersonResponse,
  type TimelineEntry,
  type TimelineQuery,
  timelineQuerySchema,
  type TimelineResponse,
  updateContactDetailsRequestSchema,
  type UpdateContactDetailsValues,
  type UpdateContactRequest,
  updateContactRequestSchema,
  type UpdateTaskRequest,
  updateTaskRequestSchema,
} from '@plp/contracts';
import type { Response } from 'express';
import { ZodPipe } from '../../shared/zod.pipe.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { leadFileResponse, NO_STORE } from '../leads/lead-file-response.js';
import { ContactProfileService } from './contact-profile.service.js';

/** A customer's profile (board 23, ADR-033); personal data, never cached. */
@Controller()
export class ContactProfileController {
  private readonly logger = new Logger(ContactProfileController.name);

  constructor(private readonly profiles: ContactProfileService) {}

  @Get('sites/:siteId/contacts/:contactId')
  @Header('Cache-Control', NO_STORE)
  profile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('contactId') contactId: string,
  ): Promise<ContactProfileResponse> {
    return this.profiles.profile(user, siteId, contactId);
  }

  @Patch('sites/:siteId/contacts/:contactId')
  @Header('Cache-Control', NO_STORE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('contactId') contactId: string,
    @Body(new ZodPipe(updateContactRequestSchema)) body: UpdateContactRequest,
  ): Promise<ContactProfile> {
    return this.profiles.update(user, siteId, contactId, body);
  }

  @Patch('sites/:siteId/contacts/:contactId/details')
  @Header('Cache-Control', NO_STORE)
  updateDetails(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('contactId') contactId: string,
    @Body(new ZodPipe(updateContactDetailsRequestSchema)) body: UpdateContactDetailsValues,
  ): Promise<ContactProfile> {
    return this.profiles.updateDetails(user, siteId, contactId, body);
  }

  @Get('sites/:siteId/contacts/:contactId/timeline')
  @Header('Cache-Control', NO_STORE)
  timeline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('contactId') contactId: string,
    @Query(new ZodPipe(timelineQuerySchema)) query: TimelineQuery,
  ): Promise<TimelineResponse> {
    return this.profiles.timeline(user, siteId, contactId, query.cursor);
  }

  @Post('sites/:siteId/contacts/:contactId/notes')
  @Header('Cache-Control', NO_STORE)
  addNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('contactId') contactId: string,
    @Body(new ZodPipe(createNoteRequestSchema)) body: CreateNoteRequest,
  ): Promise<TimelineEntry> {
    return this.profiles.addNote(user, siteId, contactId, body);
  }

  @Post('sites/:siteId/contacts/:contactId/tasks')
  @Header('Cache-Control', NO_STORE)
  addTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('contactId') contactId: string,
    @Body(new ZodPipe(createTaskRequestSchema)) body: CreateTaskRequest,
  ): Promise<ContactTask> {
    return this.profiles.addTask(user, siteId, contactId, body);
  }

  @Patch('sites/:siteId/contacts/:contactId/tasks/:taskId')
  @Header('Cache-Control', NO_STORE)
  updateTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('contactId') contactId: string,
    @Param('taskId') taskId: string,
    @Body(new ZodPipe(updateTaskRequestSchema)) body: UpdateTaskRequest,
  ): Promise<ContactTask> {
    return this.profiles.updateTask(user, siteId, contactId, taskId, body);
  }

  @Post('sites/:siteId/contacts/:contactId/meetings')
  @Header('Cache-Control', NO_STORE)
  addMeeting(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('contactId') contactId: string,
    @Body(new ZodPipe(createMeetingRequestSchema)) body: CreateMeetingRequest,
  ): Promise<ContactMeeting> {
    return this.profiles.addMeeting(user, siteId, contactId, body);
  }

  @Post('sites/:siteId/contacts/:contactId/export')
  @HttpCode(200)
  async exportPerson(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('contactId') contactId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return leadFileResponse(
      response,
      await this.profiles.exportPerson(user, siteId, contactId),
      this.logger,
    );
  }

  @Get('sites/:siteId/contacts/:contactId/deletion')
  @Header('Cache-Control', NO_STORE)
  deletionPreview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('contactId') contactId: string,
  ): Promise<ContactDeletionPreview> {
    return this.profiles.deletionPreview(user, siteId, contactId);
  }

  @Post('sites/:siteId/contacts/:contactId/delete')
  @HttpCode(200)
  deletePerson(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('contactId') contactId: string,
    @Body(new ZodPipe(deleteContactPersonRequestSchema)) body: DeleteContactPersonRequest,
  ): Promise<DeleteContactPersonResponse> {
    return this.profiles.deletePerson(user, siteId, contactId, body);
  }
}
