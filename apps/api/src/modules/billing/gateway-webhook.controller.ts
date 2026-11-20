import { Controller, HttpCode, Post } from '@nestjs/common';
import type { GatewayEvent, GatewayWebhookResponse } from '@plp/contracts';
import { PaymentGateway } from './gateway/payment-gateway.js';
import { PaymentGatewayWebhook, VerifiedGatewayEvent } from './gateway/payment-gateway-webhook.js';
import { GatewayWebhookService } from './gateway-webhook.service.js';

/**
 * `POST /public/billing/webhooks/:provider` (ADR-035): the gateway's signed events. Every event
 * that passes the signature is answered alike, applied, applied before or ignored, so the gateway
 * stops sending it and the answer tells nothing about the workspaces.
 */
@Controller('public/billing/webhooks')
export class GatewayWebhookController {
  constructor(
    private readonly gateway: PaymentGateway,
    private readonly webhooks: GatewayWebhookService,
  ) {}

  @Post(':provider')
  @HttpCode(200)
  @PaymentGatewayWebhook()
  async receive(@VerifiedGatewayEvent() event: GatewayEvent): Promise<GatewayWebhookResponse> {
    await this.webhooks.receive(this.gateway.provider, event);
    return { received: true };
  }
}
