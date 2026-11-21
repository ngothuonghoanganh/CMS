import { Body, Controller, Get, Headers, HttpCode, Param, Post, Res } from '@nestjs/common';
import {
  type ClaimMarketplaceItemRequest,
  claimMarketplaceItemRequestSchema,
  IDEMPOTENCY_KEY_HEADER,
  type MarketplaceItemDetail,
  type MarketplaceLicence,
  type MarketplaceLicenceListResponse,
  type MarketplaceListResponse,
  type MarketplacePurchaseRequest,
  marketplacePurchaseRequestSchema,
  type MarketplacePurchaseResponse,
  type MarketplaceQuote,
  type MarketplaceSuggestionResponse,
  type UpdateMarketplaceLicenceVersionRequest,
  updateMarketplaceLicenceVersionRequestSchema,
} from '@plp/contracts';
import type { Response } from 'express';
import { parseIdempotencyKey } from '../../shared/idempotency-key.js';
import { ZodPipe } from '../../shared/zod.pipe.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { MarketplacePurchases } from './marketplace-purchases.service.js';
import { MarketplaceService } from './marketplace.service.js';

@Controller()
export class MarketplaceController {
  constructor(
    private readonly marketplace: MarketplaceService,
    private readonly purchases: MarketplacePurchases,
  ) {}

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

  /** `pages.view`, for a member who cannot buy; 200 for a repeat too (`alreadySuggested`). */
  @Post('workspaces/:workspaceId/marketplace/items/:itemId/suggestions')
  @HttpCode(200)
  suggest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('itemId') itemId: string,
  ): Promise<MarketplaceSuggestionResponse> {
    return this.marketplace.suggest(user, workspaceId, itemId);
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

  /** `billing.manage`: what "Mua mẫu" would charge, with which card; never charges. */
  @Get('workspaces/:workspaceId/marketplace/items/:itemId/quote')
  quote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('itemId') itemId: string,
  ): Promise<MarketplaceQuote> {
    return this.purchases.quote(user, workspaceId, itemId);
  }

  /** 200 paid with the licence, 202 while the gateway decides; the same key answers the same. */
  @Post('workspaces/:workspaceId/marketplace/purchases')
  async purchase(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Body(new ZodPipe(marketplacePurchaseRequestSchema)) body: MarketplacePurchaseRequest,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MarketplacePurchaseResponse> {
    const key = parseIdempotencyKey(idempotencyKey);
    const outcome = await this.purchases.purchase(user, workspaceId, body, key);
    response.status(outcome.pending ? 202 : 200);
    return outcome.response;
  }
}
