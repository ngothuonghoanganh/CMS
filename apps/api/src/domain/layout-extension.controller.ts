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
  CreateLayoutExtensionRequestSchema,
  DuplicateLayoutExtensionRequestSchema,
  PublishLayoutExtensionRequestSchema,
  UpdateLayoutExtensionRequestSchema,
  type CreateLayoutExtensionRequest,
  type DuplicateLayoutExtensionRequest,
  type LayoutExtensionKind,
  type PublishLayoutExtensionRequest,
  type UpdateLayoutExtensionRequest,
} from '@payload/contracts';

import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { AuthenticationGuard } from '../common/guards/authentication.guard';
import { requireWorkspaceId } from '../common/guards/workspace-context';
import type { PlatformRequest } from '../common/interfaces/request';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthorizationService } from '../security/authorization.service';
import { AuditService } from '../security/audit.service';
import { LayoutExtensionService } from './layout-extension.service';

function kindParam(value: string): LayoutExtensionKind {
  if (value !== 'headers' && value !== 'footers') {
    throw new Error('Invalid layout kind segment');
  }
  return value === 'headers' ? 'header' : 'footer';
}

@Controller('sites/:siteId/layouts')
@UseGuards(AuthenticationGuard)
export class LayoutExtensionController {
  constructor(
    @Inject(LayoutExtensionService) private readonly layout: LayoutExtensionService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get(':kind')
  async list(
    @Param('siteId') siteId: string,
    @Param('kind') kind: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'layout.read');
    return this.layout.list(siteId, requireWorkspaceId(principal), kindParam(kind));
  }

  @Post(':kind')
  async create(
    @Param('siteId') siteId: string,
    @Param('kind') kind: string,
    @Body(new ZodValidationPipe(CreateLayoutExtensionRequestSchema))
    input: CreateLayoutExtensionRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'layout.create');
    const result = await this.layout.create(
      siteId,
      requireWorkspaceId(principal),
      kindParam(kind),
      input,
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: `site.layout.${kindParam(kind)}.create`,
        resourceType: 'layout-extension',
        resourceId: result.id,
        workspaceId: requireWorkspaceId(principal),
        result: 'success',
      })
      .catch(() => undefined);
    return result;
  }

  @Get(':kind/:resourceId')
  async get(
    @Param('siteId') siteId: string,
    @Param('kind') kind: string,
    @Param('resourceId') resourceId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'layout.read');
    return this.layout.get(
      siteId,
      requireWorkspaceId(principal),
      kindParam(kind),
      resourceId,
    );
  }

  @Patch(':kind/:resourceId')
  async update(
    @Param('siteId') siteId: string,
    @Param('kind') kind: string,
    @Param('resourceId') resourceId: string,
    @Body(new ZodValidationPipe(UpdateLayoutExtensionRequestSchema))
    input: UpdateLayoutExtensionRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'layout.update');
    const result = await this.layout.update(
      siteId,
      requireWorkspaceId(principal),
      kindParam(kind),
      resourceId,
      input,
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: `site.layout.${kindParam(kind)}.update`,
        resourceType: 'layout-extension',
        resourceId,
        workspaceId: requireWorkspaceId(principal),
        result: 'success',
        metadata: { changedFields: Object.keys(input) },
      })
      .catch(() => undefined);
    return result;
  }

  @Post(':kind/:resourceId/publish')
  async publish(
    @Param('siteId') siteId: string,
    @Param('kind') kind: string,
    @Param('resourceId') resourceId: string,
    @Body(new ZodValidationPipe(PublishLayoutExtensionRequestSchema))
    input: PublishLayoutExtensionRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'layout.publish');
    const result = await this.layout.publish(
      siteId,
      requireWorkspaceId(principal),
      kindParam(kind),
      resourceId,
      input,
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: `site.layout.${kindParam(kind)}.publish`,
        resourceType: 'layout-extension',
        resourceId: resourceId,
        workspaceId: requireWorkspaceId(principal),
        result: 'success',
      })
      .catch(() => undefined);
    return result;
  }

  @Post(':kind/:resourceId/duplicate')
  async duplicate(
    @Param('siteId') siteId: string,
    @Param('kind') kind: string,
    @Param('resourceId') resourceId: string,
    @Body(new ZodValidationPipe(DuplicateLayoutExtensionRequestSchema))
    input: DuplicateLayoutExtensionRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'layout.create');
    const result = await this.layout.duplicate(
      siteId,
      requireWorkspaceId(principal),
      kindParam(kind),
      resourceId,
      input,
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: `site.layout.${kindParam(kind)}.duplicate`,
        resourceType: 'layout-extension',
        resourceId: result.id,
        workspaceId: requireWorkspaceId(principal),
        result: 'success',
      })
      .catch(() => undefined);
    return result;
  }

  @Post(':kind/:resourceId/discard')
  async discard(
    @Param('siteId') siteId: string,
    @Param('kind') kind: string,
    @Param('resourceId') resourceId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'layout.update');
    const result = await this.layout.discard(
      siteId,
      requireWorkspaceId(principal),
      kindParam(kind),
      resourceId,
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: `site.layout.${kindParam(kind)}.discard`,
        resourceType: 'layout-extension',
        resourceId,
        workspaceId: requireWorkspaceId(principal),
        result: 'success',
      })
      .catch(() => undefined);
    return result;
  }

  @Delete(':kind/:resourceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('siteId') siteId: string,
    @Param('kind') kind: string,
    @Param('resourceId') resourceId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ): Promise<void> {
    await this.authorization.assertCan(principal, 'layout.delete');
    await this.layout.remove(
      siteId,
      requireWorkspaceId(principal),
      kindParam(kind),
      resourceId,
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: `site.layout.${kindParam(kind)}.delete`,
        resourceType: 'layout-extension',
        resourceId,
        workspaceId: requireWorkspaceId(principal),
        result: 'success',
      })
      .catch(() => undefined);
  }

  @Get(':kind/:resourceId/versions')
  async versions(
    @Param('siteId') siteId: string,
    @Param('kind') kind: string,
    @Param('resourceId') resourceId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'layout.read');
    return this.layout.listVersions(
      siteId,
      requireWorkspaceId(principal),
      kindParam(kind),
      resourceId,
    );
  }
}
