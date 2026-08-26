import { Body, Controller, Get, Inject, Param, Patch, UseGuards } from '@nestjs/common';
import {
  UpdatePageSeoSettingsRequestSchema,
  type UpdatePageSeoSettingsRequest,
} from '@payload/contracts';

import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { AuthenticationGuard } from '../common/guards/authentication.guard';
import { requireWorkspaceId } from '../common/guards/workspace-context';
import type { PlatformRequest } from '../common/interfaces/request';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { SeoService } from './seo.service';
import { AuthorizationService } from '../security/authorization.service';
import { AuditService } from '../security/audit.service';

@Controller('pages/:pageId/seo')
@UseGuards(AuthenticationGuard)
export class SeoController {
  constructor(
    @Inject(SeoService) private readonly seoService: SeoService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get()
  async get(
    @Param('pageId') pageId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'seo.read');
    return this.seoService.get(pageId, requireWorkspaceId(principal));
  }

  @Patch()
  async update(
    @Param('pageId') pageId: string,
    @Body(new ZodValidationPipe(UpdatePageSeoSettingsRequestSchema))
    input: UpdatePageSeoSettingsRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'seo.update');
    const result = await this.seoService.update(
      pageId,
      requireWorkspaceId(principal),
      input,
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'seo.update',
        resourceType: 'page_seo',
        resourceId: pageId,
        ...(principal?.workspaceId ? { workspaceId: principal.workspaceId } : {}),
        result: 'success',
        metadata: { changedFields: Object.keys(input) },
      })
      .catch(() => undefined);
    return result;
  }
}
