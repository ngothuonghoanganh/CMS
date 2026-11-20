import {
  applyDecorators,
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  type RawBodyRequest,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import type { GatewayEvent } from '@plp/contracts';
import type { Request } from 'express';
import { AppError, notFound } from '../../../shared/errors.js';
import { SIGNED_BY_PAYMENT_GATEWAY } from '../../../shared/payment-gateway-route.js';
import { Public } from '../../auth/public.decorator.js';
import { GatewayWebhookRejected, PaymentGateway } from './payment-gateway.js';

interface GatewayRequest extends RawBodyRequest<Request> {
  gatewayEvent?: GatewayEvent;
}

/**
 * Accepts only the configured gateway's signed events (ADR-035): another provider in the path is
 * not found, a missing or wrong signature is 401, a signed body that is no event is 400. The
 * adapter checks the signature over the raw body, before anything parses it.
 */
@Injectable()
export class PaymentGatewaySignatureGuard implements CanActivate {
  constructor(private readonly gateway: PaymentGateway) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<GatewayRequest>();
    if (this.gateway.provider === 'none' || request.params['provider'] !== this.gateway.provider) {
      throw notFound();
    }
    const body = Buffer.isBuffer(request.body)
      ? request.body
      : (request.rawBody ?? Buffer.alloc(0));
    try {
      request.gatewayEvent = await this.gateway.parseWebhook(body, request.headers);
    } catch (error) {
      if (!(error instanceof GatewayWebhookRejected)) {
        throw error;
      }
      throw error.reason === 'signature'
        ? new AppError(401, 'unauthenticated', 'Chữ ký của cổng thanh toán không hợp lệ', {
            cause: error,
          })
        : new AppError(
            400,
            'validation_failed',
            'Nội dung không phải sự kiện của cổng thanh toán',
            {
              cause: error,
            },
          );
    }
    return true;
  }
}

/** The payment gateway's webhook: no session, no Origin check, the gateway's signature. */
export function PaymentGatewayWebhook(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    Public(),
    SetMetadata(SIGNED_BY_PAYMENT_GATEWAY, true),
    UseGuards(PaymentGatewaySignatureGuard),
  );
}

/** The event the signature guard checked; only valid on `@PaymentGatewayWebhook()` routes. */
export const VerifiedGatewayEvent = createParamDecorator(
  (_data: unknown, context: ExecutionContext): GatewayEvent => {
    const event = context.switchToHttp().getRequest<GatewayRequest>().gatewayEvent;
    if (!event) {
      throw new Error('VerifiedGatewayEvent used on a route without @PaymentGatewayWebhook()');
    }
    return event;
  },
);
