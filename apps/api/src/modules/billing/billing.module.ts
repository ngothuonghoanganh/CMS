import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import type { Env } from '../../config/env.js';
import { ENV } from '../../shared/env.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { BillingAccountController } from './billing-account.controller.js';
import { BillingAccountService } from './billing-account.service.js';
import { BILLING_EVENT_MODEL, billingEventSchema } from './billing-event.schema.js';
import { BillingEventsRepository } from './billing-events.repository.js';
import { BillingController } from './billing.controller.js';
import { BillingCoreModule } from './billing-core.module.js';
import { BillingService } from './billing.service.js';
import { createPaymentGateway } from './gateway/create-payment-gateway.js';
import { PaymentGateway } from './gateway/payment-gateway.js';
import { PaymentGatewaySignatureGuard } from './gateway/payment-gateway-webhook.js';
import { GatewayWebhookController } from './gateway-webhook.controller.js';
import { GatewayWebhookService } from './gateway-webhook.service.js';
import { InvoiceCharges } from './invoice-charges.service.js';
import {
  INVOICE_COUNTER_MODEL,
  INVOICE_MODEL,
  invoiceCounterSchema,
  invoiceSchema,
} from './invoice.schema.js';
import { InvoiceSettlement } from './invoice-settlement.service.js';
import { InvoicesController } from './invoices.controller.js';
import { InvoicesRepository } from './invoices.repository.js';
import { InvoicesService } from './invoices.service.js';
import { SubscriptionBackfill } from './subscription-backfill.service.js';
import { TestClockController } from './test-clock.controller.js';

/**
 * The endpoints of plans and billing (ADR-035), the trials of workspaces made before them, and
 * payments: the gateway `PAYMENT_PROVIDER` names, cards, billing info, invoices and the gateway's
 * webhook.
 */
@Module({
  imports: [
    BillingCoreModule,
    WorkspacesModule,
    MongooseModule.forFeature([
      { name: INVOICE_MODEL, schema: invoiceSchema },
      { name: INVOICE_COUNTER_MODEL, schema: invoiceCounterSchema },
      { name: BILLING_EVENT_MODEL, schema: billingEventSchema },
    ]),
  ],
  controllers: [
    BillingController,
    BillingAccountController,
    InvoicesController,
    GatewayWebhookController,
    TestClockController,
  ],
  providers: [
    { provide: PaymentGateway, inject: [ENV], useFactory: (env: Env) => createPaymentGateway(env) },
    BillingService,
    BillingAccountService,
    InvoicesRepository,
    InvoiceSettlement,
    InvoiceCharges,
    InvoicesService,
    BillingEventsRepository,
    GatewayWebhookService,
    PaymentGatewaySignatureGuard,
    SubscriptionBackfill,
  ],
})
export class BillingModule {}
