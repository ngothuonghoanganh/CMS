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
  CreateNavigationRequestSchema,
  UpdateNavigationRequestSchema,
  type CreateNavigationRequest,
  type UpdateNavigationRequest,
} from '@payload/contracts';

import { AuthenticationGuard } from '../common/guards/authentication.guard';
import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { requireWorkspaceId } from '../common/guards/workspace-context';
import type { PlatformRequest } from '../common/interfaces/request';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthorizationService } from '../security/authorization.service';
import { NavigationService } from './navigation.service';

@Controller('sites/:siteId/navigations')
@UseGuards(AuthenticationGuard)
export class NavigationController {
  constructor(
    @Inject(NavigationService) private readonly navigation: NavigationService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
  ) {}

  @Get()
  async list(
    @Param('siteId') siteId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'site.read');
    return this.navigation.list(siteId, requireWorkspaceId(principal));
  }

  @Get(':navigationId')
  async get(
    @Param('siteId') siteId: string,
    @Param('navigationId') navigationId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'site.read');
    return this.navigation.get(siteId, navigationId, requireWorkspaceId(principal));
  }

  @Post()
  async create(
    @Param('siteId') siteId: string,
    @Body(new ZodValidationPipe(CreateNavigationRequestSchema))
    input: CreateNavigationRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'site.update');
    return this.navigation.create(siteId, input, requireWorkspaceId(principal));
  }

  @Patch(':navigationId')
  async update(
    @Param('siteId') siteId: string,
    @Param('navigationId') navigationId: string,
    @Body(new ZodValidationPipe(UpdateNavigationRequestSchema))
    input: UpdateNavigationRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'site.update');
    return this.navigation.update(
      siteId,
      navigationId,
      input,
      requireWorkspaceId(principal),
    );
  }

  @Delete(':navigationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('siteId') siteId: string,
    @Param('navigationId') navigationId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ): Promise<void> {
    await this.authorization.assertCan(principal, 'site.update');
    await this.navigation.remove(siteId, navigationId, requireWorkspaceId(principal));
  }
}
