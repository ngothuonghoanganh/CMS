import { Body, Controller, Get, Inject, Param, Patch, UseGuards } from '@nestjs/common';
import {
  UpdateFormIntegrationBindingRequestSchema,
  type UpdateFormIntegrationBindingRequest,
} from '@payload/contracts';

import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { AuthenticationGuard } from '../common/guards/authentication.guard';
import { requireWorkspaceId } from '../common/guards/workspace-context';
import type { PlatformRequest } from '../common/interfaces/request';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { FormIntegrationBindingService } from './form-integration-binding.service';
import { AuthorizationService } from '../security/authorization.service';
import { AuditService } from '../security/audit.service';

@Controller('pages/:pageId/form-integrations')
@UseGuards(AuthenticationGuard)
export class FormIntegrationBindingController {
  constructor(
    @Inject(FormIntegrationBindingService)
    private readonly bindingService: FormIntegrationBindingService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get()
  async list(
    @Param('pageId') pageId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'form-integration.read');
    return this.bindingService.list(pageId, requireWorkspaceId(principal));
  }

  @Patch(':formNodeId')
  async update(
    @Param('pageId') pageId: string,
    @Param('formNodeId') formNodeId: string,
    @Body(new ZodValidationPipe(UpdateFormIntegrationBindingRequestSchema))
    input: UpdateFormIntegrationBindingRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'form-integration.update');
    const result = await this.bindingService.update(
      pageId,
      formNodeId,
      requireWorkspaceId(principal),
      input,
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'form-integration.update',
        resourceType: 'form_integration_binding',
        resourceId: formNodeId,
        ...(principal?.workspaceId ? { workspaceId: principal.workspaceId } : {}),
        result: 'success',
        metadata: { integrationCount: input.integrationIds.length },
      })
      .catch(() => undefined);
    return result;
  }
}
