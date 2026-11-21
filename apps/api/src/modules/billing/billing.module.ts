import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import type { Env } from '../../config/env.js';
import { ENV } from '../../shared/env.js';
import { AuthModule } from '../auth/auth.module.js';
import { EmailModule } from '../notifications/email.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { BillingAccountController } from './billing-account.controller.js';
import { BillingAccountService } from './billing-account.service.js';
import { BILLING_EVENT_MODEL, billingEventSchema } from './billing-event.schema.js';
import { BillingEventsRepository } from './billing-events.repository.js';
import { BillingJob } from './billing-job.service.js';
import { BILLING_NOTICE_MODEL, billingNoticeSchema } from './billing-notice.schema.js';
import { BillingNoticesRepository } from './billing-notices.repository.js';
import { BillingNotifier } from './billing-notifier.service.js';
import { BillingSchedule } from './billing-schedule.service.js';
import { BillingScheduler } from './billing-scheduler.service.js';
import { BillingController } from './billing.controller.js';
import { BillingCoreModule } from './billing-core.module.js';
import { BillingService } from './billing.service.js';
import { FakeGatewayController } from './gateway/fake/fake-gateway.controller.js';
import { FakeWebhookSender } from './gateway/fake/fake-webhook-sender.js';
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
import { InvoiceTransfers } from './invoice-transfers.service.js';
import { InvoicesController } from './invoices.controller.js';
import { InvoicesRepository } from './invoices.repository.js';
import { InvoicesService } from './invoices.service.js';
import { MarketplacePurchaseHooks } from './marketplace-purchase-hooks.js';
import { SubscriptionBackfill } from './subscription-backfill.service.js';
import { TestClockController } from './test-clock.controller.js';

/**
 * The endpoints of plans and billing (ADR-035), the trials of workspaces made before them, and
 * payments: the gateway `PAYMENT_PROVIDER` names, cards, billing info, invoices and the gateway's
 * webhook; and the subscriptions' life (T3): the billing job, transfers and the plan's emails. The
 * marketplace buys its items through it (ADR-036): `InvoiceCharges` charges them, and the
 * marketplace module registers on `MarketplacePurchaseHooks` what paying one grants; billing
 * never imports the marketplace.
 */
@Module({
  imports: [
    AuthModule,
    BillingCoreModule,
    EmailModule,
    WorkspacesModule,
    MongooseModule.forFeature([
      { name: INVOICE_MODEL, schema: invoiceSchema },
      { name: INVOICE_COUNTER_MODEL, schema: invoiceCounterSchema },
      { name: BILLING_EVENT_MODEL, schema: billingEventSchema },
      { name: BILLING_NOTICE_MODEL, schema: billingNoticeSchema },
    ]),
  ],
  controllers: [
    BillingController,
    BillingAccountController,
    InvoicesController,
    GatewayWebhookController,
    FakeGatewayController,
    TestClockController,
  ],
  providers: [
    { provide: PaymentGateway, inject: [ENV], useFactory: (env: Env) => createPaymentGateway(env) },
    BillingService,
    BillingAccountService,
    InvoicesRepository,
    InvoiceSettlement,
    InvoiceCharges,
    InvoiceTransfers,
    InvoicesService,
    BillingSchedule,
    BillingNoticesRepository,
    BillingNotifier,
    BillingJob,
    BillingScheduler,
    BillingEventsRepository,
    GatewayWebhookService,
    FakeWebhookSender,
    PaymentGatewaySignatureGuard,
    SubscriptionBackfill,
    MarketplacePurchaseHooks,
  ],
  exports: [InvoiceCharges, InvoicesService, BillingNotifier, MarketplacePurchaseHooks],
})
export class BillingModule {}
