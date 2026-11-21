import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  type ClaimMarketplaceItemRequest,
  claimMarketplaceItemRequestSchema,
  type MarketplaceItemDetail,
  type MarketplaceLicence,
  type MarketplaceLicenceListResponse,
  type MarketplaceListResponse,
  type UpdateMarketplaceLicenceVersionRequest,
  updateMarketplaceLicenceVersionRequestSchema,
} from '@plp/contracts';
import { ZodPipe } from '../../shared/zod.pipe.js';
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

  /** 200 whether it granted the licence or the workspace held it already: the same answer. */
  @Post('workspaces/:workspaceId/marketplace/items/:itemId/claim')
  @HttpCode(200)
  claim(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('itemId') itemId: string,
    @Body(new ZodPipe(claimMarketplaceItemRequestSchema)) body: ClaimMarketplaceItemRequest,
  ): Promise<MarketplaceLicence> {
    return this.marketplace.claim(user, workspaceId, itemId, body);
  }

  @Get('workspaces/:workspaceId/marketplace/licences')
  licences(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ): Promise<MarketplaceLicenceListResponse> {
    return this.marketplace.licenceList(user, workspaceId);
  }

  @Post('workspaces/:workspaceId/marketplace/licences/:itemId/version')
  @HttpCode(200)
  updateVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('itemId') itemId: string,
    @Body(new ZodPipe(updateMarketplaceLicenceVersionRequestSchema))
    body: UpdateMarketplaceLicenceVersionRequest,
  ): Promise<MarketplaceLicence> {
    return this.marketplace.updateVersion(user, workspaceId, itemId, body);
  }
}
