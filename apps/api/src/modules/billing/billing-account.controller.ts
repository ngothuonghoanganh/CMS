import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import {
  type BillingInfo,
  type BillingInfoResponse,
  billingInfoSchema,
  type MethodSetupResponse,
  type PaymentMethodResponse,
  type StartMethodSetupRequest,
  startMethodSetupRequestSchema,
} from '@plp/contracts';
import { ZodPipe } from '../../shared/zod.pipe.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { BillingAccountService } from './billing-account.service.js';

/** Board 29's card and billing info (ADR-035): `billing.manage`. */
@Controller('workspaces/:workspaceId/billing')
export class BillingAccountController {
  constructor(private readonly account: BillingAccountService) {}

  @Get('payment-method')
  paymentMethod(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ): Promise<PaymentMethodResponse> {
    return this.account.paymentMethod(user, workspaceId);
  }

  /** The gateway's page that saves a card; the admin sends the browser to its `url`. */
  @Post('payment-method/setup')
  @HttpCode(200)
  startMethodSetup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Body(new ZodPipe(startMethodSetupRequestSchema)) body: StartMethodSetupRequest,
  ): Promise<MethodSetupResponse> {
    return this.account.startMethodSetup(user, workspaceId, body);
  }

  @Get('info')
  billingInfo(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ): Promise<BillingInfoResponse> {
    return this.account.billingInfo(user, workspaceId);
  }

  @Put('info')
  updateBillingInfo(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Body(new ZodPipe(billingInfoSchema)) body: BillingInfo,
  ): Promise<BillingInfoResponse> {
    return this.account.updateBillingInfo(user, workspaceId, body);
  }
}
