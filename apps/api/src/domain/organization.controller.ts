import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CreateOrganizationMembershipRequestSchema,
  CreateOrganizationRequestSchema,
  CreateWorkspaceRequestSchema,
  UpdateOrganizationMembershipRequestSchema,
  UpdateOrganizationRequestSchema,
  type CreateOrganizationMembershipRequest,
  type CreateOrganizationRequest,
  type CreateWorkspaceRequest,
  type UpdateOrganizationMembershipRequest,
  type UpdateOrganizationRequest,
} from '@payload/contracts';

import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { AuthenticationGuard } from '../common/guards/authentication.guard';
import type { PlatformRequest } from '../common/interfaces/request';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { OrganizationService } from './organization.service';

@Controller('organizations')
@UseGuards(AuthenticationGuard)
export class OrganizationController {
  constructor(
    @Inject(OrganizationService) private readonly service: OrganizationService,
  ) {}

  @Get()
  list(@CurrentPrincipal() principal: PlatformRequest['auth']) {
    return this.service.listForUser(requireSubject(principal));
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateOrganizationRequestSchema))
    input: CreateOrganizationRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.service.create(requireSubject(principal), input);
  }

  @Get(':organizationId')
  get(
    @Param('organizationId') organizationId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.service.get(requireSubject(principal), organizationId);
  }

  @Patch(':organizationId')
  update(
    @Param('organizationId') organizationId: string,
    @Body(new ZodValidationPipe(UpdateOrganizationRequestSchema))
    input: UpdateOrganizationRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.service.update(requireSubject(principal), organizationId, input);
  }

  @Get(':organizationId/members')
  listMembers(
    @Param('organizationId') organizationId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.service.listMembers(requireSubject(principal), organizationId);
  }

  @Post(':organizationId/members')
  addMember(
    @Param('organizationId') organizationId: string,
    @Body(new ZodValidationPipe(CreateOrganizationMembershipRequestSchema))
    input: CreateOrganizationMembershipRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.service.addMember(requireSubject(principal), organizationId, input);
  }

  @Patch(':organizationId/members/:memberId')
  updateMember(
    @Param('organizationId') organizationId: string,
    @Param('memberId') memberId: string,
    @Body(new ZodValidationPipe(UpdateOrganizationMembershipRequestSchema))
    input: UpdateOrganizationMembershipRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.service.updateMember(
      requireSubject(principal),
      organizationId,
      memberId,
      input,
    );
  }

  @Delete(':organizationId/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @Param('organizationId') organizationId: string,
    @Param('memberId') memberId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.service.removeMember(requireSubject(principal), organizationId, memberId);
  }

  @Get(':organizationId/workspaces')
  listWorkspaces(
    @Param('organizationId') organizationId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.service.listWorkspaces(requireSubject(principal), organizationId);
  }

  @Post(':organizationId/workspaces')
  createWorkspace(
    @Param('organizationId') organizationId: string,
    @Body(new ZodValidationPipe(CreateWorkspaceRequestSchema))
    input: CreateWorkspaceRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.service.createWorkspace(requireSubject(principal), organizationId, input);
  }
}

function requireSubject(principal: PlatformRequest['auth']): string {
  if (!principal?.subject)
    throw new Error('Authentication guard did not attach a principal');
  return principal.subject;
}
