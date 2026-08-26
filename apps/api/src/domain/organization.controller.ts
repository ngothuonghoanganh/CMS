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
import { AuthorizationService } from '../security/authorization.service';
import { AuditService } from '../security/audit.service';

@Controller('organizations')
@UseGuards(AuthenticationGuard)
export class OrganizationController {
  constructor(
    @Inject(OrganizationService) private readonly service: OrganizationService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get()
  list(@CurrentPrincipal() principal: PlatformRequest['auth']) {
    return this.service.listForUser(requireSubject(principal));
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(CreateOrganizationRequestSchema))
    input: CreateOrganizationRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'workspace.create');
    return this.service.create(requireSubject(principal), input);
  }

  @Get(':organizationId')
  async get(
    @Param('organizationId') organizationId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'workspace.read');
    return this.service.get(requireSubject(principal), organizationId);
  }

  @Patch(':organizationId')
  async update(
    @Param('organizationId') organizationId: string,
    @Body(new ZodValidationPipe(UpdateOrganizationRequestSchema))
    input: UpdateOrganizationRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'workspace.update');
    return this.service.update(requireSubject(principal), organizationId, input);
  }

  @Get(':organizationId/members')
  async listMembers(
    @Param('organizationId') organizationId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'member.read');
    return this.service.listMembers(requireSubject(principal), organizationId);
  }

  @Post(':organizationId/members')
  async addMember(
    @Param('organizationId') organizationId: string,
    @Body(new ZodValidationPipe(CreateOrganizationMembershipRequestSchema))
    input: CreateOrganizationMembershipRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'member.add');
    const result = await this.service.addMember(
      requireSubject(principal),
      organizationId,
      input,
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'member.add',
        resourceType: 'member',
        resourceId: result.id,
        result: 'success',
        metadata: { userId: result.userId, role: result.role },
      })
      .catch(() => undefined);
    return result;
  }

  @Patch(':organizationId/members/:memberId')
  async updateMember(
    @Param('organizationId') organizationId: string,
    @Param('memberId') memberId: string,
    @Body(new ZodValidationPipe(UpdateOrganizationMembershipRequestSchema))
    input: UpdateOrganizationMembershipRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'member.update');
    const result = await this.service.updateMember(
      requireSubject(principal),
      organizationId,
      memberId,
      input,
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'member.update',
        resourceType: 'member',
        resourceId: memberId,
        result: 'success',
        metadata: { role: result.role },
      })
      .catch(() => undefined);
    return result;
  }

  @Delete(':organizationId/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Param('organizationId') organizationId: string,
    @Param('memberId') memberId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'member.remove');
    const result = await this.service.removeMember(
      requireSubject(principal),
      organizationId,
      memberId,
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'member.remove',
        resourceType: 'member',
        resourceId: memberId,
        result: 'success',
      })
      .catch(() => undefined);
    return result;
  }

  @Get(':organizationId/workspaces')
  async listWorkspaces(
    @Param('organizationId') organizationId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'workspace.read');
    return this.service.listWorkspaces(requireSubject(principal), organizationId);
  }

  @Post(':organizationId/workspaces')
  async createWorkspace(
    @Param('organizationId') organizationId: string,
    @Body(new ZodValidationPipe(CreateWorkspaceRequestSchema))
    input: CreateWorkspaceRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'workspace.create');
    return this.service.createWorkspace(requireSubject(principal), organizationId, input);
  }
}

function requireSubject(principal: PlatformRequest['auth']): string {
  if (!principal?.subject)
    throw new Error('Authentication guard did not attach a principal');
  return principal.subject;
}
