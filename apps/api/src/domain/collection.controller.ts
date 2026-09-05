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
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CollectionEntryListQuerySchema,
  CollectionQueryRequestSchema,
  CreateCollectionEntryRequestSchema,
  CreateCollectionRequestSchema,
  TenantPermissions,
  UpdateCollectionEntryRequestSchema,
  UpdateCollectionRequestSchema,
  type CollectionEntryListQuery,
  type CollectionQueryRequest,
  type CreateCollectionEntryRequest,
  type CreateCollectionRequest,
  type UpdateCollectionEntryRequest,
  type UpdateCollectionRequest,
} from '@payload/contracts';

import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { AuthenticationGuard } from '../common/guards/authentication.guard';
import { requireRequestedWorkspace } from '../common/guards/workspace-context';
import type { PlatformRequest } from '../common/interfaces/request';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuditService } from '../security/audit.service';
import { AuthorizationService } from '../security/authorization.service';
import { CollectionService } from './collection.service';

@Controller('workspaces/:workspaceId/sites/:siteId/collections')
@UseGuards(AuthenticationGuard)
export class CollectionController {
  constructor(
    @Inject(CollectionService) private readonly collections: CollectionService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get()
  async list(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(
      principal,
      TenantPermissions.CollectionRead,
      workspaceId,
    );
    return this.collections.list(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
    );
  }

  @Post()
  async create(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @Body(new ZodValidationPipe(CreateCollectionRequestSchema))
    input: CreateCollectionRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(
      principal,
      TenantPermissions.CollectionCreate,
      workspaceId,
    );
    const result = await this.collections.create(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
      input,
    );
    await this.writeAudit(
      principal,
      workspaceId,
      'collection.create',
      'collection',
      result.id,
    );
    return result;
  }

  @Get(':collectionId')
  async get(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @Param('collectionId') collectionId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(
      principal,
      TenantPermissions.CollectionRead,
      workspaceId,
    );
    return this.collections.get(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
      collectionId,
    );
  }

  @Patch(':collectionId')
  async update(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @Param('collectionId') collectionId: string,
    @Body(new ZodValidationPipe(UpdateCollectionRequestSchema))
    input: UpdateCollectionRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(
      principal,
      TenantPermissions.CollectionUpdate,
      workspaceId,
    );
    const result = await this.collections.update(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
      collectionId,
      input,
    );
    await this.writeAudit(
      principal,
      workspaceId,
      'collection.update',
      'collection',
      collectionId,
    );
    return result;
  }

  @Delete(':collectionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @Param('collectionId') collectionId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ): Promise<void> {
    await this.authorization.assertCan(
      principal,
      TenantPermissions.CollectionDelete,
      workspaceId,
    );
    await this.collections.archive(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
      collectionId,
    );
    await this.writeAudit(
      principal,
      workspaceId,
      'collection.archive',
      'collection',
      collectionId,
    );
  }

  @Get(':collectionId/usage')
  async usage(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @Param('collectionId') collectionId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(
      principal,
      TenantPermissions.CollectionRead,
      workspaceId,
    );
    return {
      collectionId,
      references: await this.collections.getUsage(
        requireRequestedWorkspace(principal, workspaceId),
        siteId,
        collectionId,
      ),
    };
  }

  @Get(':collectionId/entries')
  async listEntries(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @Param('collectionId') collectionId: string,
    @Query(new ZodValidationPipe(CollectionEntryListQuerySchema))
    query: CollectionEntryListQuery,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(
      principal,
      TenantPermissions.EntryRead,
      workspaceId,
    );
    return this.collections.listEntries(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
      collectionId,
      query,
    );
  }

  @Post(':collectionId/entries')
  async createEntry(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @Param('collectionId') collectionId: string,
    @Body(new ZodValidationPipe(CreateCollectionEntryRequestSchema))
    input: CreateCollectionEntryRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(
      principal,
      TenantPermissions.EntryCreate,
      workspaceId,
    );
    const result = await this.collections.createEntry(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
      collectionId,
      input,
      principal?.subject,
    );
    await this.writeAudit(
      principal,
      workspaceId,
      'entry.create',
      'collection-entry',
      result.id,
    );
    return result;
  }

  @Get(':collectionId/entries/:entryId')
  async getEntry(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @Param('collectionId') collectionId: string,
    @Param('entryId') entryId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(
      principal,
      TenantPermissions.EntryRead,
      workspaceId,
    );
    return this.collections.getEntry(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
      collectionId,
      entryId,
    );
  }

  @Patch(':collectionId/entries/:entryId')
  async updateEntry(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @Param('collectionId') collectionId: string,
    @Param('entryId') entryId: string,
    @Body(new ZodValidationPipe(UpdateCollectionEntryRequestSchema))
    input: UpdateCollectionEntryRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(
      principal,
      TenantPermissions.EntryUpdate,
      workspaceId,
    );
    const result = await this.collections.updateEntry(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
      collectionId,
      entryId,
      input,
      principal?.subject,
    );
    await this.writeAudit(
      principal,
      workspaceId,
      'entry.update',
      'collection-entry',
      entryId,
    );
    return result;
  }

  @Post(':collectionId/entries/:entryId/publish')
  async publishEntry(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @Param('collectionId') collectionId: string,
    @Param('entryId') entryId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(
      principal,
      TenantPermissions.EntryPublish,
      workspaceId,
    );
    const result = await this.collections.publishEntry(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
      collectionId,
      entryId,
    );
    await this.writeAudit(
      principal,
      workspaceId,
      'entry.publish',
      'collection-entry',
      entryId,
    );
    return result;
  }

  @Post(':collectionId/entries/:entryId/discard')
  async discardEntry(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @Param('collectionId') collectionId: string,
    @Param('entryId') entryId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(
      principal,
      TenantPermissions.EntryUpdate,
      workspaceId,
    );
    const result = await this.collections.discardDraft(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
      collectionId,
      entryId,
    );
    await this.writeAudit(
      principal,
      workspaceId,
      'entry.discard',
      'collection-entry',
      entryId,
    );
    return result;
  }

  @Delete(':collectionId/entries/:entryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archiveEntry(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @Param('collectionId') collectionId: string,
    @Param('entryId') entryId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ): Promise<void> {
    await this.authorization.assertCan(
      principal,
      TenantPermissions.EntryDelete,
      workspaceId,
    );
    await this.collections.archiveEntry(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
      collectionId,
      entryId,
    );
    await this.writeAudit(
      principal,
      workspaceId,
      'entry.archive',
      'collection-entry',
      entryId,
    );
  }

  @Post(':collectionId/query')
  async query(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @Param('collectionId') collectionId: string,
    @Body(new ZodValidationPipe(CollectionQueryRequestSchema))
    input: CollectionQueryRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(
      principal,
      TenantPermissions.EntryRead,
      workspaceId,
    );
    return this.collections.query(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
      collectionId,
      input,
      'draft',
    );
  }

  private async writeAudit(
    principal: PlatformRequest['auth'],
    workspaceId: string,
    action: string,
    resourceType: string,
    resourceId: string,
  ): Promise<void> {
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action,
        resourceType,
        resourceId,
        workspaceId,
        result: 'success',
      })
      .catch(() => undefined);
  }
}
