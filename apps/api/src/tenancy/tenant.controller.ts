import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CreateTenantRequestSchema, type CreateTenantRequest } from '@payload/contracts';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import { AuthenticationGuard } from '../common/guards/authentication.guard';
import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import type { PlatformRequest } from '../common/interfaces/request';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { MASTER_CONNECTION } from './master-connection';
import { PlatformUserRecord } from './schemas/platform-user.schema';

@Controller('control-plane/tenants')
@UseGuards(AuthenticationGuard)
export class TenantController {
  constructor(
    @InjectModel(PlatformUserRecord.name, MASTER_CONNECTION)
    private readonly platformUserModel: Model<PlatformUserRecord>,
    @Inject(TenantProvisioningService)
    private readonly provisioning: TenantProvisioningService,
  ) {}

  @Get()
  async list(@CurrentPrincipal() principal: PlatformRequest['auth']) {
    await this.requirePlatformAdmin(principal);
    return this.provisioning.list();
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(CreateTenantRequestSchema)) input: CreateTenantRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.requirePlatformAdmin(principal);
    return this.provisioning.create(input);
  }

  @Post(':tenantId/provision')
  async retry(
    @Param('tenantId') tenantId: string,
    @Body(new ZodValidationPipe(CreateTenantRequestSchema)) input: CreateTenantRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.requirePlatformAdmin(principal);
    return this.provisioning.retry(tenantId, input);
  }

  private async requirePlatformAdmin(principal: PlatformRequest['auth']): Promise<void> {
    const platformUser = principal
      ? await this.platformUserModel
          .findOne({
            email: principal.subject.toLowerCase(),
            role: 'platform-admin',
            status: 'active',
          })
          .exec()
      : null;
    if (!platformUser) {
      throw new ForbiddenException({
        code: 'PLATFORM_ADMIN_REQUIRED',
        message: 'Platform administrator access is required',
      });
    }
  }
}
