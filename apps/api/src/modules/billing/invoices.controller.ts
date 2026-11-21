import { Controller, Get, Headers, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import {
  type CursorQuery,
  cursorQuerySchema,
  IDEMPOTENCY_KEY_HEADER,
  type Invoice,
  type InvoiceListResponse,
  type InvoiceReceipt,
  type PayInvoiceResponse,
  type StartTransferResponse,
} from '@plp/contracts';
import type { Response } from 'express';
import { parseIdempotencyKey } from '../../shared/idempotency-key.js';
import { ZodPipe } from '../../shared/zod.pipe.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { InvoicesService } from './invoices.service.js';

/** Board 29's "Lịch sử giao dịch", receipts and "Thanh toán lại" (ADR-035): `billing.manage`. */
@Controller('workspaces/:workspaceId/billing/invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Query(new ZodPipe(cursorQuerySchema)) query: CursorQuery,
  ): Promise<InvoiceListResponse> {
    return this.invoices.list(user, workspaceId, query);
  }

  @Get(':invoiceId')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('invoiceId') invoiceId: string,
  ): Promise<Invoice> {
    return this.invoices.get(user, workspaceId, invoiceId);
  }

  @Get(':invoiceId/receipt')
  receipt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('invoiceId') invoiceId: string,
  ): Promise<InvoiceReceipt> {
    return this.invoices.receipt(user, workspaceId, invoiceId);
  }

  /** 200 paid, 202 while the gateway decides; the same `Idempotency-Key` answers the same. */
  @Post(':invoiceId/pay')
  async pay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('invoiceId') invoiceId: string,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PayInvoiceResponse> {
    const key = parseIdempotencyKey(idempotencyKey);
    const outcome = await this.invoices.pay(user, workspaceId, invoiceId, key);
    response.status(outcome.pending ? 202 : 200);
    return { invoice: outcome.invoice };
  }

  /** "Chuyển khoản" (T3): the invoice waits for a transfer, with its details; asked again, the same. */
  @Post(':invoiceId/transfer')
  @HttpCode(200)
  async startTransfer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('invoiceId') invoiceId: string,
  ): Promise<StartTransferResponse> {
    return { invoice: await this.invoices.startTransfer(user, workspaceId, invoiceId) };
  }
}
