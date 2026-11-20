import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, Logger, Post, Query, Res } from '@nestjs/common';
import type { GatewayEvent } from '@plp/contracts';
import type { Response } from 'express';
import { z } from 'zod';
import { notFound } from '../../../../shared/errors.js';
import { ZodPipe } from '../../../../shared/zod.pipe.js';
import { Public } from '../../../auth/public.decorator.js';
import { PaymentGateway } from '../payment-gateway.js';
import { fakeCardTokenFor, FAKE_GATEWAY_PATH } from './fake-gateway-protocol.js';
import { renderGatewayError, renderSetupDone, renderSetupPage } from './fake-gateway-page.js';
import { FakePaymentGateway } from './fake-payment-gateway.js';
import { FakeWebhookDeliveryFailed, FakeWebhookSender } from './fake-webhook-sender.js';

const setupFormSchema = z.object({
  session: z.string().max(4000),
  number: z.string().max(40).default(''),
  expiry: z.string().max(20).default(''),
  cvc: z.string().max(10).default(''),
});

const sessionQuerySchema = z.object({ session: z.string().max(4000).default('') });

const EXPIRED_MESSAGE = 'Phiên thêm thẻ đã hết hạn hoặc không hợp lệ.';

/** The card's last day: its month's end, as a real gateway reads "MM/YY". */
function parseExpiry(value: string): { expMonth: number; expYear: number } | null {
  const match = /^(0[1-9]|1[0-2])\s*\/\s*(\d{2}|\d{4})$/.exec(value.trim());
  if (!match?.[1] || !match[2]) {
    return null;
  }
  const year = Number(match[2]);
  return { expMonth: Number(match[1]), expYear: year < 100 ? 2000 + year : year };
}

function expired(expiry: { expMonth: number; expYear: number }, now: Date): boolean {
  return (
    expiry.expYear < now.getUTCFullYear() ||
    (expiry.expYear === now.getUTCFullYear() && expiry.expMonth < now.getUTCMonth() + 1)
  );
}

/**
 * The fake gateway's card page (ADR-035), under `FAKE_GATEWAY_PATH` and only with
 * `PAYMENT_PROVIDER=fake`; any other provider makes these routes 404. The browser reaches it
 * through the admin's `/api` proxy. A test card becomes a token and the number is dropped; the
 * `method_saved` event reaches the webhook before the browser is sent back, so the admin finds
 * the card there. A session saves one card: opened again, its page says so and leads back.
 */
@Controller(FAKE_GATEWAY_PATH.replace(/^\//, ''))
export class FakeGatewayController {
  private readonly logger = new Logger(FakeGatewayController.name);

  constructor(
    private readonly gateway: PaymentGateway,
    private readonly sender: FakeWebhookSender,
  ) {}

  @Get('setup')
  @Public()
  showSetup(
    @Query(new ZodPipe(sessionQuerySchema)) query: z.infer<typeof sessionQuerySchema>,
    @Res() response: Response,
  ): void {
    const fake = this.fakeGateway();
    const token = query.session;
    const session = fake.setupSession(token);
    if (session === null) {
      this.page(response, 400, renderGatewayError(EXPIRED_MESSAGE));
      return;
    }
    if (fake.setupUsed(session)) {
      this.page(response, 200, renderSetupDone(session.returnUrl));
      return;
    }
    this.page(response, 200, renderSetupPage({ session: token, cancelUrl: session.cancelUrl }));
  }

  @Post('setup')
  @Public()
  async saveCard(
    @Body(new ZodPipe(setupFormSchema)) form: z.infer<typeof setupFormSchema>,
    @Res() response: Response,
  ): Promise<void> {
    const fake = this.fakeGateway();
    const session = fake.setupSession(form.session);
    if (session === null) {
      this.page(response, 400, renderGatewayError(EXPIRED_MESSAGE));
      return;
    }
    if (fake.setupUsed(session)) {
      this.page(response, 409, renderSetupDone(session.returnUrl));
      return;
    }
    const retry = (error: string): void => {
      this.page(
        response,
        422,
        renderSetupPage({
          session: form.session,
          cancelUrl: session.cancelUrl,
          error,
          expiry: form.expiry,
        }),
      );
    };
    const card = fakeCardTokenFor(form.number);
    if (card === null) {
      retry('Đây không phải thẻ thử. Hãy dùng một trong các thẻ thử bên dưới.');
      return;
    }
    const expiry = parseExpiry(form.expiry);
    if (expiry === null) {
      retry('Ngày hết hạn cần có dạng MM/YY, ví dụ 12/35.');
      return;
    }
    if (expired(expiry, new Date())) {
      retry('Thẻ đã hết hạn. Hãy nhập ngày hết hạn trong tương lai.');
      return;
    }
    if (!/^\d{3,4}$/.test(form.cvc.trim())) {
      retry('CVC gồm 3 hoặc 4 chữ số.');
      return;
    }
    // Taken only now, so a mistyped card can be corrected; two posts at once save one card.
    if (!fake.claimSetup(session)) {
      this.page(response, 409, renderSetupDone(session.returnUrl));
      return;
    }
    const event: GatewayEvent = {
      kind: 'method_saved',
      eventId: `evt_fake_${randomUUID()}`,
      occurredAt: new Date().toISOString(),
      reference: session.reference,
      method: { token: card.token, brand: card.brand, last4: card.last4, ...expiry },
    };
    try {
      await this.sender.send(event);
    } catch (error) {
      fake.releaseSetup(session);
      if (!(error instanceof FakeWebhookDeliveryFailed)) {
        throw error;
      }
      // The event id says which delivery failed; nothing of the card is in it.
      this.logger.error(`The fake gateway could not deliver ${event.eventId}`, error.cause);
      this.page(
        response,
        502,
        renderGatewayError('Cổng thử không gửi được thông báo tới hệ thống. Hãy thử lại.'),
      );
      return;
    }
    response.setHeader('Cache-Control', 'no-store');
    response.redirect(303, session.returnUrl);
  }

  private fakeGateway(): FakePaymentGateway {
    if (!(this.gateway instanceof FakePaymentGateway)) {
      throw notFound();
    }
    return this.gateway;
  }

  private page(response: Response, status: number, html: string): void {
    response
      .status(status)
      .set({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy':
          "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
        // Not `no-referrer`: Chromium then posts the form with `Origin: null`, which OriginGuard
        // rejects. `same-origin` keeps the Origin of the admin and sends no referrer elsewhere.
        'Referrer-Policy': 'same-origin',
        'X-Robots-Tag': 'noindex',
      })
      .send(html);
  }
}
