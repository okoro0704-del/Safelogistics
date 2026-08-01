/** Manual Master Admin payments — no plans, subscriptions, or online gateways. */

export const PAYMENT_METHODS = [
  "bank_transfer",
  "cash",
  "mobile_money",
  "other",
] as const;

export const PAYMENT_METHOD_LABELS: Record<
  (typeof PAYMENT_METHODS)[number],
  string
> = {
  bank_transfer: "Bank Transfer",
  cash: "Cash",
  mobile_money: "Mobile Money",
  other: "Other",
};

export function formatMoneyCents(
  cents: number,
  currency = "USD",
  locale = "en-US",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
