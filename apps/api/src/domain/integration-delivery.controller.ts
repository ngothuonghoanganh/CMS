import { Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  IntegrationDeliveryListQuerySchema,
  type IntegrationDeliveryListQuery,
} from '@payload/contracts';

import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { AuthenticationGuard } from '../common/guards/authentication.guard';
import { requireWorkspaceId } from '../common/guards/workspace-context';
import type { PlatformRequest } from '../common/interfaces/request';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { IntegrationDispatcher } from './integration-dispatcher';

@Controller('integration-deliveries')
@UseGuards(AuthenticationGuard)
export class IntegrationDeliveryController {
  constructor(
    @Inject(IntegrationDispatcher)
    private readonly dispatcher: IntegrationDispatcher,
  ) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(IntegrationDeliveryListQuerySchema))
    query: IntegrationDeliveryListQuery,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.dispatcher.list(requireWorkspaceId(principal), query);
  }

  @Post(':deliveryId/retry')
  async retry(
    @Param('deliveryId') deliveryId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.dispatcher.retry(deliveryId, requireWorkspaceId(principal));
  }
}
