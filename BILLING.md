# Payments (manual records)

The platform does not use plans or subscriptions. The Master Admin manually receives payment from customers and may record those payments in the platform.

The platform does not process online payments.

There is **no** Stripe, PayPal, Paddle, checkout, card processing, or payment gateway.

## Business model

Customer pays Master Admin offline → Master Admin records payment (optional) → Master Admin creates the white-label app → Admin receives login details.

- Tenant Admins do **not** see payment records
- Customers have **no** payment UI
- Creating an app does not require a payment record

## Table

`payments` — offline payment ledger (`recorded` / `voided`). Money uses integer cents. Methods: Bank Transfer, Cash, Mobile Money, Other.

## Master Admin UI

| Route | Purpose |
|-------|---------|
| `/master-admin/billing` | Payment records + simple totals |
| `/master-admin/companies/[id]/payments` | Company payment history; record / void |
| Create New App wizard | Optional Payment step (Yes/No) |

## APIs / RPCs

- `master_record_payment`, `master_void_payment`
- `master_payment_stats` (alias `master_billing_stats`)
- `master_provision_company` (optional payment fields only)
- `GET /api/master-admin/billing`
- `GET` / `PATCH /api/master-admin/companies/[id]/payments`

## Visibility

Master Admin: all payment records. Tenant Admin / Customer: nothing.

## Security

RLS Master Admin only on `payments`. APIs use `requireMasterAdminApi`. Custom tenant domains must not expose `/master-admin/*`.
