---
name: fdb-money-inputs
description: >-
  Standard for SGD / dollar amount entry in fdb-tracker. Use when adding or editing
  forms that capture money (balances, income, loans, premiums, tax reliefs, CPF
  withdrawals). Ensures at least two decimal places (cents) via CurrencyInput.
---

# FDB Tracker: money inputs (cents)

## When to apply

- New or changed **forms** for amounts stored or shown as **dollars** (prefix `$`, salary, principal, premium, relief amount, bank balance, etc.).
- Auditing whether a numeric field should use cents-capable entry.

## Rule: use `CurrencyInput`

- Import **`CurrencyInput`** from `@/components/ui/currency-input`.
- **Do not** use `<Input type="number">` for dollar amounts. Native number inputs have awkward stepping, locale issues, and are easy to configure without cent precision.
- The wrapper fixes **2 decimal places** (`decimalsLimit` / `decimalScale` = 2), comma thousands, period decimal, and optional comma-as-decimal normalization in `transformRawValue`.

## When not to use `CurrencyInput`

- **Integers:** birth year, loan tenure (months), counts, Telegram max members.
- **Unit quantities:** shares, ounces — use `<Input type="number" step="any" min={0} />` (or product-appropriate `step`).
- **Percentage rates:** loan % p.a., savings interest % — typically `<Input type="number" step={0.01} />`. (Onboarding loans currently use `CurrencyInput` for rate; that is an existing pattern, not a requirement everywhere.)

## Negatives

- Default: **positive / zero only** (`allowNegativeValue` false).
- Pass **`allowNegativeValue`** only when the product allows signed cash (e.g. investment account cash balance).

## UX

- Use **`placeholder="0.00"`** on money fields (the default placeholder on the shared component is `0.00`).
- **`onChange`** receives **`number | null`**. Normalize to `0`, or `null` for optional fields, consistently with the rest of the form.

## Backend

- Send JSON **numbers**; prefer DB **`numeric(…, 2)`** (or equivalent). Rounding to 2dp before persist is optional if the database and Zod already constrain precision.

## Reference

- Implementation: `components/ui/currency-input.tsx`
- Related UI skill: `.cursor/skills/fdb-frontend/SKILL.md`
