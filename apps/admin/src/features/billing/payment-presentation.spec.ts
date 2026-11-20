import { describe, expect, it } from 'vitest';
import {
  billingInfoValues,
  brandName,
  cardExpiryNote,
  cardLabel,
  invoiceDate,
  invoiceDescription,
  invoiceReference,
  invoiceStatusView,
  taxCodeMessage,
} from './payment-presentation';
import { invoiceSummaryFixture, visaCard } from './test-fixtures';

describe('cards', () => {
  it('names the card as the board does, without its number', () => {
    expect(cardLabel(visaCard)).toBe('Thẻ Visa •••• 4242');
    expect(brandName('mastercard')).toBe('Mastercard');
    expect(brandName('unionpay')).toBe('Unionpay');
  });

  it('says when it expires, and that an expired card cannot pay', () => {
    expect(cardExpiryNote(visaCard)).toEqual({ text: 'Hết hạn 08/2030', danger: false });
    expect(cardExpiryNote({ ...visaCard, expired: true })).toEqual({
      text: 'Đã hết hạn 08/2030. Đổi thẻ để thanh toán.',
      danger: true,
    });
  });
});

describe('invoices', () => {
  it('describes a period and an upgrade', () => {
    const invoice = invoiceSummaryFixture();

    expect(invoiceDescription(invoice)).toBe('Gói Doanh nghiệp · kỳ 21/11/2026 – 21/12/2026');
    expect(invoiceDescription({ ...invoice, kind: 'upgrade' })).toBe(
      'Nâng cấp lên Gói Doanh nghiệp · kỳ 21/11/2026 – 21/12/2026',
    );
  });

  it('shows the number with how it was paid', () => {
    const invoice = invoiceSummaryFixture();

    expect(invoiceReference(invoice)).toBe('HD-2026-000001 · Thẻ Visa •••• 4242');
    expect(invoiceReference({ ...invoice, card: null })).toBe('HD-2026-000001 · Thẻ');
    expect(invoiceReference({ ...invoice, method: 'transfer' })).toBe(
      'HD-2026-000001 · Chuyển khoản',
    );
  });

  it('dates a paid invoice by its payment and an unpaid one by its creation', () => {
    expect(invoiceDate(invoiceSummaryFixture())).toBe('21/11/2026');
    expect(
      invoiceDate(invoiceSummaryFixture({ paidAt: null, createdAt: '2026-11-20T03:00:00.000Z' })),
    ).toBe('20/11/2026');
  });

  it('colours the status with the contract labels', () => {
    expect(invoiceStatusView('paid')).toEqual({ label: 'Đã thanh toán', tone: 'success' });
    expect(invoiceStatusView('failed')).toEqual({ label: 'Thất bại', tone: 'danger' });
    expect(invoiceStatusView('pending').label).toBe('Đang xử lý');
  });
});

describe('taxCodeMessage', () => {
  it('counts the digits, as board 29 does', () => {
    expect(taxCodeMessage('0315 123 45', 'Mã số thuế gồm 10 chữ số')).toBe(
      'Mã số thuế gồm 10 hoặc 13 chữ số. Hiện có 9.',
    );
    expect(taxCodeMessage('', 'x')).toBe('Mã số thuế gồm 10 hoặc 13 chữ số. Hiện có 0.');
  });

  it('keeps the contract message for a code with letters, and says nothing without an error', () => {
    expect(taxCodeMessage('03151234AB', 'Mã số thuế gồm 10 chữ số')).toBe(
      'Mã số thuế gồm 10 chữ số',
    );
    expect(taxCodeMessage('0315123456', undefined)).toBeUndefined();
  });
});

describe('billingInfoValues', () => {
  it('starts an empty form before the info was ever filled', () => {
    expect(billingInfoValues(null)).toEqual({
      companyName: '',
      taxCode: '',
      address: '',
      email: '',
    });
  });
});
