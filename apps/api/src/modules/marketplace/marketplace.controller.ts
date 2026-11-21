import { Controller, Get, Param } from '@nestjs/common';
import type { MarketplaceItemDetail, MarketplaceListResponse } from '@plp/contracts';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { MarketplaceService } from './marketplace.service.js';

@Controller()
export class MarketplaceController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Get('workspaces/:workspaceId/marketplace')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ): Promise<MarketplaceListResponse> {
    return this.marketplace.list(user, workspaceId);
  }

  @Get('workspaces/:workspaceId/marketplace/items/:itemId')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('itemId') itemId: string,
  ): Promise<MarketplaceItemDetail> {
    return this.marketplace.detail(user, workspaceId, itemId);
  }
}
