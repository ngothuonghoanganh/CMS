import { type BillingCycle, billingCycleLabels, vnDayOf } from '@plp/contracts';

/*
 * How the emails of the plan write amounts, days and cards (ADR-035, T3): as the admin does on
 * boards 28 and 29, so the email and the screen say the same thing.
 */

/** "599.000 ₫". */
export function vndText(amount: number): string {
  return `${String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} ₫`;
}

/** "04/12/2026": the day in Vietnam. */
export function vnDateText(at: Date): string {
  const [year, month, day] = vnDayOf(at).split('-');
  return `${day ?? ''}/${month ?? ''}/${year ?? ''}`;
}

/** "01/11/2026 – 01/12/2026". */
export function periodText(start: Date, end: Date): string {
  return `${vnDateText(start)} – ${vnDateText(end)}`;
}

const BRAND_NAMES: Readonly<Record<string, string>> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  jcb: 'JCB',
};

/** "Visa •••• 4242": the network and the last four digits, never more of the card. */
export function cardText(card: { brand: string; last4: string }): string {
  const brand =
    BRAND_NAMES[card.brand.toLowerCase()] ??
    card.brand.charAt(0).toUpperCase() + card.brand.slice(1);
  return `${brand} •••• ${card.last4}`;
}

/** "tháng" or "năm". */
export function cycleText(cycle: BillingCycle): string {
  return billingCycleLabels[cycle];
}
