import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  PageExtensionMutationRequestSchema,
  type PageExtensionMutationRequest,
} from '@payload/contracts';

import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { AuthenticationGuard } from '../common/guards/authentication.guard';
import { requireWorkspaceId } from '../common/guards/workspace-context';
import type { PlatformRequest } from '../common/interfaces/request';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuditService } from '../security/audit.service';
import { AuthorizationService } from '../security/authorization.service';
import { PageExtensionService } from './page-extension.service';

@Controller('pages/:pageId/extensions')
@UseGuards(AuthenticationGuard)
export class PageExtensionController {
  constructor(
    @Inject(PageExtensionService) private readonly pageExtensions: PageExtensionService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get()
  async list(
    @Param('pageId') pageId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'page.read');
    return this.pageExtensions.list(pageId, requireWorkspaceId(principal));
  }

  @Get('capabilities')
  async capabilities(
    @Param('pageId') pageId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'page.read');
    return this.pageExtensions.resolveCapabilities(pageId, requireWorkspaceId(principal));
  }

  @Put(':extensionId')
  async upsert(
    @Param('pageId') pageId: string,
    @Param('extensionId') extensionId: string,
    @Body(new ZodValidationPipe(PageExtensionMutationRequestSchema))
    input: PageExtensionMutationRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'page.update');
    const result = await this.pageExtensions.upsert(
      pageId,
      extensionId,
      input,
      requireWorkspaceId(principal),
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: result.enabled ? 'page.extension.enabled' : 'page.extension.disabled',
        resourceType: 'page_extension',
        resourceId: result.id,
        ...(principal?.workspaceId ? { workspaceId: principal.workspaceId } : {}),
        result: 'success',
        metadata: { pageId, extensionId, changedFields: Object.keys(input) },
      })
      .catch(() => undefined);
    return result;
  }

  @Delete(':extensionId')
  async remove(
    @Param('pageId') pageId: string,
    @Param('extensionId') extensionId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ): Promise<void> {
    await this.authorization.assertCan(principal, 'page.update');
    await this.pageExtensions.remove(pageId, extensionId, requireWorkspaceId(principal));
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'page.extension.removed',
        resourceType: 'page_extension',
        resourceId: extensionId,
        ...(principal?.workspaceId ? { workspaceId: principal.workspaceId } : {}),
        result: 'success',
        metadata: { pageId, extensionId },
      })
      .catch(() => undefined);
  }
}
