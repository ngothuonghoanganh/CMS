import { describe, expect, it } from 'vitest';
import { changePlanRequestSchema } from './billing.js';
import {
  gatewayEventSchema,
  invoiceNumberSchema,
  invoiceTransferSchema,
  paymentMethodViewSchema,
  planChangeImpactsSchema,
  planChangeQuoteQuerySchema,
} from './billing-payments.js';

describe('gateway events', () => {
  const base = { eventId: 'evt_1', occurredAt: '2026-11-21T03:00:00.000Z', reference: 'ref' };

  it('carry a card as its token and what the owner sees, never its number', () => {
    const method = { token: 'tok_1', brand: 'visa', last4: '4242', expMonth: 8, expYear: 2028 };
    expect(gatewayEventSchema.parse({ kind: 'method_saved', ...base, method }).kind).toBe(
      'method_saved',
    );
    expect(
      gatewayEventSchema.safeParse({
        kind: 'method_saved',
        ...base,
        method: { ...method, number: '4242424242424242' },
      }).success,
    ).toBe(false);
  });

  it('name the charge they decide, and refuse kinds the port does not know', () => {
    const charge = { ...base, idempotencyKey: 'ref-1', amount: 357_000 };
    expect(gatewayEventSchema.safeParse({ kind: 'charge_succeeded', ...charge }).success).toBe(
      true,
    );
    expect(
      gatewayEventSchema.safeParse({ kind: 'charge_failed', ...charge, code: 'insufficient_funds' })
        .success,
    ).toBe(true);
    expect(gatewayEventSchema.safeParse({ kind: 'charge_failed', ...charge }).success).toBe(false);
    expect(gatewayEventSchema.safeParse({ kind: 'refund', ...charge }).success).toBe(false);
    expect(
      gatewayEventSchema.safeParse({ kind: 'charge_succeeded', ...charge, amount: -1 }).success,
    ).toBe(false);
  });
});

describe('plan change requests', () => {
  it('are free unless they pay now, and read payNow from a query string', () => {
    expect(changePlanRequestSchema.parse({ planId: 'basic', cycle: 'monthly' })).toEqual({
      planId: 'basic',
      cycle: 'monthly',
      payNow: false,
    });
    expect(
      changePlanRequestSchema.safeParse({ planId: 'basic', cycle: 'monthly', expectedAmount: 1.5 })
        .success,
    ).toBe(false);
    expect(planChangeQuoteQuerySchema.parse({ planId: 'business', cycle: 'yearly' }).payNow).toBe(
      false,
    );
    expect(
      planChangeQuoteQuerySchema.parse({ planId: 'business', cycle: 'yearly', payNow: 'true' })
        .payNow,
    ).toBe(true);
    expect(
      planChangeQuoteQuerySchema.safeParse({ planId: 'business', cycle: 'yearly', payNow: '1' })
        .success,
    ).toBe(false);
  });
});

describe('T3 lifecycle shapes', () => {
  it('take a payment now by transfer, and a scheduled change with its impacts', () => {
    expect(
      changePlanRequestSchema.parse({
        planId: 'basic',
        cycle: 'yearly',
        payNow: true,
        expectedAmount: 1_990_000,
        payWith: 'transfer',
      }).payWith,
    ).toBe('transfer');
    expect(
      changePlanRequestSchema.safeParse({ planId: 'basic', cycle: 'yearly', payWith: 'wallet' })
        .success,
    ).toBe(false);
    expect(
      planChangeImpactsSchema.parse({
        overLimits: [{ limit: 'sites', used: 4, max: 1 }],
        automationsToPause: 3,
        aiUses: { from: 100, to: 20 },
        members: 7,
      }).overLimits,
    ).toEqual([{ limit: 'sites', used: 4, max: 1 }]);
  });

  it('draw a transfer’s QR code as an SVG data URL, never a link elsewhere', () => {
    const transfer = {
      bankName: 'Ngân hàng',
      accountNumber: '0000000000',
      accountName: 'PLP',
      content: 'PLP HD-2026-000001',
      amount: 599_000,
      qrDataUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
      pageUrl: null,
      startedAt: '2026-11-21T03:00:00.000Z',
    };
    expect(invoiceTransferSchema.safeParse(transfer).success).toBe(true);
    expect(
      invoiceTransferSchema.safeParse({ ...transfer, qrDataUrl: 'https://qr.example/x.png' })
        .success,
    ).toBe(false);
  });
});

describe('invoices and cards', () => {
  it('number invoices HD-{năm}-{6 chữ số}', () => {
    expect(invoiceNumberSchema.safeParse('HD-2026-000001').success).toBe(true);
    expect(invoiceNumberSchema.safeParse('HD-2026-1101').success).toBe(false);
  });

  it('show a card without its token', () => {
    const view = paymentMethodViewSchema.parse({
      brand: 'visa',
      last4: '4242',
      expMonth: 8,
      expYear: 2028,
      expired: false,
      token: 'tok_1',
    });
    expect(view).not.toHaveProperty('token');
  });
});
