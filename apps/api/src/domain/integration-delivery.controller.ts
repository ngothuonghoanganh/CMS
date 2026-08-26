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
import { AuthorizationService } from '../security/authorization.service';
import { AuditService } from '../security/audit.service';

@Controller('integration-deliveries')
@UseGuards(AuthenticationGuard)
export class IntegrationDeliveryController {
  constructor(
    @Inject(IntegrationDispatcher)
    private readonly dispatcher: IntegrationDispatcher,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(IntegrationDeliveryListQuerySchema))
    query: IntegrationDeliveryListQuery,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'integration.delivery.read');
    return this.dispatcher.list(requireWorkspaceId(principal), query);
  }

  @Post(':deliveryId/retry')
  async retry(
    @Param('deliveryId') deliveryId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'integration.delivery.retry');
    const result = await this.dispatcher.retry(deliveryId, requireWorkspaceId(principal));
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'integration.delivery.retry',
        resourceType: 'integration_delivery',
        resourceId: deliveryId,
        ...(principal?.workspaceId ? { workspaceId: principal.workspaceId } : {}),
        result: 'success',
      })
      .catch(() => undefined);
    return result;
  }
}
