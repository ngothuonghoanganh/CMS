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

@Controller('pages/:pageId/form-integrations')
@UseGuards(AuthenticationGuard)
export class FormIntegrationBindingController {
  constructor(
    @Inject(FormIntegrationBindingService)
    private readonly bindingService: FormIntegrationBindingService,
  ) {}

  @Get()
  async list(
    @Param('pageId') pageId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
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
    return this.bindingService.update(
      pageId,
      formNodeId,
      requireWorkspaceId(principal),
      input,
    );
  }
}
