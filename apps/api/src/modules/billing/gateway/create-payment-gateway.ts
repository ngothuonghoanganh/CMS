import { randomBytes } from 'node:crypto';
import { type Env, paymentProviderOf } from '../../../config/env.js';
import { DisabledPaymentGateway } from './disabled-payment-gateway.js';
import { FAKE_GATEWAY_PATH } from './fake/fake-gateway-protocol.js';
import { FakePaymentGateway } from './fake/fake-payment-gateway.js';
import type { PaymentGateway } from './payment-gateway.js';

/**
 * The adapter `PAYMENT_PROVIDER` names (ADR-035); `parseEnv` has refused the fake in production.
 * A real gateway is one more case here, with its keys from the environment.
 */
export function createPaymentGateway(
  env: Pick<Env, 'PAYMENT_PROVIDER' | 'PAYMENT_WEBHOOK_SECRET' | 'NODE_ENV' | 'ADMIN_ORIGIN'>,
): PaymentGateway {
  const provider = paymentProviderOf(env);
  switch (provider) {
    case 'none':
      return new DisabledPaymentGateway();
    case 'fake':
      return new FakePaymentGateway({
        // One process signs and checks its own webhooks, so a random secret works without one.
        secret: env.PAYMENT_WEBHOOK_SECRET ?? randomBytes(32).toString('base64url'),
        // The browser reaches the API through the admin's `/api` proxy.
        pagesUrl: `${new URL(env.ADMIN_ORIGIN).origin}/api${FAKE_GATEWAY_PATH}`,
      });
  }
}
